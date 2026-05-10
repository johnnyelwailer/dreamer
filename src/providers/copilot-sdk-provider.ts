import type { IntelligenceProvider } from "../core/contracts.js";
import {
  CopilotClient,
  approveAll,
  type CopilotClientOptions,
  type InfiniteSessionConfig,
  type ModelCapabilitiesOverride,
  type ProviderConfig
} from "@github/copilot-sdk";
import { createDreamAgentStreamHandler } from "./copilot-sdk-stream.js";

export const COPILOT_SDK_PROVIDER_NO_SUMMARY = "No summary returned.";
export const COPILOT_SDK_PROVIDER_REQUEST_FAILED = "Copilot SDK provider request failed.";
type CopilotSession = {
  sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
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
      onPermissionRequest: approveAll
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
    const onStreamEvent = createDreamAgentStreamHandler();
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
