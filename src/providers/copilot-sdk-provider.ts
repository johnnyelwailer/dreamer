import type { IntelligenceProvider, RunAgentOptions } from "../core/contracts.js";
import {
  CopilotClient,
  type CopilotClientOptions,
  type InfiniteSessionConfig,
  type ModelCapabilitiesOverride,
  type ProviderConfig
} from "@github/copilot-sdk";
import { createAgentToolGuard } from "./copilot-sdk-agent-tool-guard.js";
import { createDreamAgentStreamHandler } from "./copilot-sdk-stream.js";
import {
  COPILOT_SDK_PROVIDER_NO_SUMMARY,
  COPILOT_SDK_PROVIDER_REQUEST_FAILED,
  extractAssistantText
} from "./copilot-sdk-text.js";

export { COPILOT_SDK_PROVIDER_NO_SUMMARY, COPILOT_SDK_PROVIDER_REQUEST_FAILED } from "./copilot-sdk-text.js";

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

export class CopilotSdkProvider implements IntelligenceProvider {
  readonly id = "provider.copilot.sdk";
  private client: CopilotClient | null = null;
  private session: CopilotSession | null = null;
  private sessionPromise: Promise<CopilotSession> | null = null;

  constructor(private readonly options: CopilotSdkProviderOptions) {}

  private sessionConfig(overrides: RunAgentOptions = {}) {
    return {
      model: this.options.model,
      provider: this.options.sessionConfig.provider,
      gitHubToken: this.options.sessionConfig.gitHubToken,
      infiniteSessions: this.options.sessionConfig.infiniteSessions,
      modelCapabilities: this.options.sessionConfig.modelCapabilities,
      streaming: this.options.sessionConfig.streaming,
      includeSubAgentStreamingEvents: this.options.sessionConfig.includeSubAgentStreamingEvents,
      configDir: this.options.sessionConfig.configDir,
      workingDirectory: overrides.workingDirectory ?? this.options.sessionConfig.workingDirectory
    };
  }

  private async createSession(): Promise<CopilotSession> {
    const client = new CopilotClient(this.options.clientOptions);
    const guard = createAgentToolGuard();
    await client.start();
    const session = (await client.createSession({
      ...this.sessionConfig(),
      onPermissionRequest: guard.onPermissionRequest,
      hooks: guard.hooks
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
      const response = await (await this.getSession()).sendAndWait({ prompt: input }, this.options.requestTimeoutMs);
      return extractAssistantText(response) || COPILOT_SDK_PROVIDER_NO_SUMMARY;
    } catch {
      await this.dispose();
      return COPILOT_SDK_PROVIDER_REQUEST_FAILED;
    }
  }

  async runAgent(prompt: string, tools: unknown[], options: RunAgentOptions = {}): Promise<string> {
    const client = new CopilotClient(this.options.clientOptions);
    const onStreamEvent = createDreamAgentStreamHandler({ agentTag: options.selectedAgent ?? options.streamTag ?? "dream agent" });
    const guard = createAgentToolGuard({
      allowedTaskAgentTypes: options.customAgents?.map((agent) => agent.name),
      defaultAgentExcludedTools: options.defaultAgent?.excludedTools,
      initialAgent: options.selectedAgent
    });

    try {
      await client.start();
      const session = (await client.createSession({
        ...this.sessionConfig(options),
        customAgents: options.customAgents as Parameters<typeof client.createSession>[0]["customAgents"],
        defaultAgent: options.defaultAgent as Parameters<typeof client.createSession>[0]["defaultAgent"],
        agent: options.selectedAgent,
        onPermissionRequest: guard.onPermissionRequest,
        hooks: guard.hooks,
        onEvent: (event) => {
          guard.onEvent(event);
          onStreamEvent?.(event);
          options.onSubagentEvent?.(event);
        },
        tools: tools as Parameters<typeof client.createSession>[0]["tools"]
      })) as CopilotSession;

      let lastOutput = "";
      for (const p of [prompt, ...(options.retries ?? [])]) {
        lastOutput = extractAssistantText(await session.sendAndWait({ prompt: p }, this.options.requestTimeoutMs));
      }
      return lastOutput;
    } catch (error) {
      return `${COPILOT_SDK_PROVIDER_REQUEST_FAILED}: ${String(error)}`;
    } finally {
      await client.stop().catch(() => undefined);
    }
  }
}
