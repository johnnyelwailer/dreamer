import type { IntelligenceProvider } from "../core/contracts.js";
import {
  CopilotClient,
  approveAll,
  type CopilotClientOptions,
  type InfiniteSessionConfig,
  type ModelCapabilitiesOverride,
  type ProviderConfig,
  type ToolResultObject
} from "@github/copilot-sdk";
import { createDreamAgentStreamHandler } from "./copilot-sdk-stream.js";

export const COPILOT_SDK_PROVIDER_NO_SUMMARY = "No summary returned.";
export const COPILOT_SDK_PROVIDER_REQUEST_FAILED = "Copilot SDK provider request failed.";
type CopilotSession = {
  sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
};

type ToolHookInput = {
  toolName: string;
  toolArgs: unknown;
  toolResult?: ToolResultObject;
};

type BashSessionGuardHooks = {
  onPreToolUse: (input: ToolHookInput) =>
    | {
        permissionDecision: "allow" | "deny";
        permissionDecisionReason?: string;
        additionalContext?: string;
      }
    | undefined;
  onPostToolUse: (input: ToolHookInput) => undefined;
};

export type CopilotSdkProviderOptions = {
  model: string;
  requestTimeoutMs: number;
  clientOptions: Pick<
    CopilotClientOptions,
    "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env" | "onListModels"
  >;
  sessionConfig: {
    provider?: ProviderConfig;
    gitHubToken?: string;
    infiniteSessions?: InfiniteSessionConfig;
    modelCapabilities?: ModelCapabilitiesOverride;
    streaming?: boolean;
    includeSubAgentStreamingEvents?: boolean;
    configDir?: string;
    workingDirectory?: string;
  };
};

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(value);
}

function extractAssistantText(response: unknown): string {
  const record = response as Record<string, unknown>;
  const data = record?.data as Record<string, unknown> | undefined;
  const content = data?.content;
  if (content) return normalizeText(content).trim();
  return normalizeText(response).trim();
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const field = record[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function scanShellIds(value: unknown, ids: Set<string>): void {
  if (typeof value === "string") {
    const patterns = [
      /\bshellId\b\s*[:=]\s*["']?([A-Za-z0-9._:-]+)/g,
      /\bshell ID\b\s*[:=]\s*["']?([A-Za-z0-9._:-]+)/gi
    ];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        const id = match[1]?.trim();
        if (id) ids.add(id);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) scanShellIds(item, ids);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, field] of Object.entries(value)) {
    if (key === "shellId" && typeof field === "string" && field.trim()) {
      ids.add(field.trim());
    } else {
      scanShellIds(field, ids);
    }
  }
}

function extractReturnedShellIds(result: ToolResultObject): Set<string> {
  const ids = new Set<string>();
  scanShellIds(result, ids);
  return ids;
}

function createBashSessionGuardHooks(allowedTaskAgentTypes: Iterable<string> = []): BashSessionGuardHooks {
  const activeShellIds = new Set<string>();
  const allowedAgents = new Set([...allowedTaskAgentTypes].map((name) => name.trim()).filter(Boolean));
  return {
    onPreToolUse: (input) => {
      if (input.toolName === "task" && allowedAgents.size > 0) {
        const agentType = readStringField(input.toolArgs, "agent_type");
        if (!agentType || !allowedAgents.has(agentType)) {
          return {
            permissionDecision: "deny" as const,
            permissionDecisionReason:
              "Only configured specialist custom agents may be used for this stage. Built-in or general-purpose agents are disabled.",
            additionalContext:
              `Use one of these specialist agent_type values: ${[...allowedAgents].sort().join(", ")}. ` +
              "Do not use explore, general-purpose, or placeholder agent types."
          };
        }
      }
      if (input.toolName !== "read_bash") return undefined;
      const shellId = readStringField(input.toolArgs, "shellId");
      if (shellId && activeShellIds.has(shellId)) return { permissionDecision: "allow" as const };
      return {
        permissionDecision: "deny" as const,
        permissionDecisionReason:
          "read_bash is only valid when a previous bash call returned a real shellId for an active shell session. " +
          "Do not invent shell IDs. For completed bash commands, use the bash result directly. " +
          "For large files, run bounded bash commands such as wc -l, sed -n, rg, head, or tail.",
        additionalContext:
          "The read_bash call was denied because its shellId was not returned by a previous bash call in this session. " +
          "Use bash directly for bounded file inspection, and only call read_bash after bash returns a shellId."
      };
    },
    onPostToolUse: (input) => {
      if (input.toolName !== "bash" || input.toolResult?.resultType !== "success") return undefined;
      for (const id of extractReturnedShellIds(input.toolResult)) activeShellIds.add(id);
      return undefined;
    }
  };
}

export class CopilotSdkProvider implements IntelligenceProvider {
  readonly id = "provider.copilot.sdk";
  private client: CopilotClient | null = null;
  private session: CopilotSession | null = null;
  private sessionPromise: Promise<CopilotSession> | null = null;

  constructor(private readonly options: CopilotSdkProviderOptions) {}

  private async createSession(): Promise<CopilotSession> {
    const client = new CopilotClient(this.options.clientOptions);
    await client.start();
    const session = (await client.createSession({
      model: this.options.model,
      provider: this.options.sessionConfig.provider,
      gitHubToken: this.options.sessionConfig.gitHubToken,
      infiniteSessions: this.options.sessionConfig.infiniteSessions,
      modelCapabilities: this.options.sessionConfig.modelCapabilities,
      streaming: this.options.sessionConfig.streaming,
      includeSubAgentStreamingEvents: this.options.sessionConfig.includeSubAgentStreamingEvents,
      configDir: this.options.sessionConfig.configDir,
      workingDirectory: this.options.sessionConfig.workingDirectory,
      onPermissionRequest: approveAll,
      hooks: createBashSessionGuardHooks()
    })) as CopilotSession;
    this.client = client;
    return session;
  }

  private async getSession(): Promise<CopilotSession> {
    if (this.session) return this.session;
    if (!this.sessionPromise) this.sessionPromise = this.createSession();
    this.session = await this.sessionPromise;
    this.sessionPromise = null;
    return this.session;
  }

  async dispose(): Promise<void> {
    this.session = null;
    this.sessionPromise = null;
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
  }

  async summarize(input: string): Promise<string> {
    try {
      const session = await this.getSession();
      const response = await session.sendAndWait({ prompt: input }, this.options.requestTimeoutMs);
      return extractAssistantText(response) || COPILOT_SDK_PROVIDER_NO_SUMMARY;
    } catch {
      await this.dispose();
      return COPILOT_SDK_PROVIDER_REQUEST_FAILED;
    }
  }

  async runAgent(prompt: string, tools: unknown[], options: import("../core/contracts.js").RunAgentOptions = {}): Promise<string> {
    const client = new CopilotClient(this.options.clientOptions);
    const onStreamEvent = createDreamAgentStreamHandler({ agentTag: options.selectedAgent ?? options.streamTag ?? "dream agent" });
    let lastOutput = "";
    try {
      await client.start();
      const session = (await client.createSession({
        model: this.options.model,
        provider: this.options.sessionConfig.provider,
        gitHubToken: this.options.sessionConfig.gitHubToken,
        infiniteSessions: this.options.sessionConfig.infiniteSessions,
        modelCapabilities: this.options.sessionConfig.modelCapabilities,
        streaming: this.options.sessionConfig.streaming,
        includeSubAgentStreamingEvents: this.options.sessionConfig.includeSubAgentStreamingEvents,
        configDir: this.options.sessionConfig.configDir,
        workingDirectory: options.workingDirectory ?? this.options.sessionConfig.workingDirectory,
        customAgents: options.customAgents as Parameters<typeof client.createSession>[0]["customAgents"],
        defaultAgent: options.defaultAgent as Parameters<typeof client.createSession>[0]["defaultAgent"],
        agent: options.selectedAgent,
        onPermissionRequest: approveAll,
        hooks: createBashSessionGuardHooks(options.customAgents?.map((agent) => agent.name)),
        onEvent: (event) => {
          onStreamEvent?.(event);
          options.onSubagentEvent?.(event);
        },
        tools: tools as Parameters<typeof client.createSession>[0]["tools"]
      })) as CopilotSession;

      const prompts = [prompt, ...(options.retries ?? [])];
      for (const p of prompts) {
        const response = await session.sendAndWait({ prompt: p }, this.options.requestTimeoutMs);
        lastOutput = extractAssistantText(response);
      }
      return lastOutput;
    } catch (error) {
      return `${COPILOT_SDK_PROVIDER_REQUEST_FAILED}: ${String(error)}`;
    } finally {
      await client.stop().catch(() => undefined);
    }
  }
}
