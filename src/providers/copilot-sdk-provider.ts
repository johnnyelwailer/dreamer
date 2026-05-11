import type { IntelligenceProvider, RunAgentOptions } from "../core/contracts.js";
import { CopilotClient } from "@github/copilot-sdk";
import { createAgentToolGuard } from "./copilot-sdk-agent-tool-guard.js";
import { buildProviderSessionConfig } from "./copilot-sdk-provider-session-config.js";
import { runCopilotSdkAgent } from "./copilot-sdk-provider-run-agent.js";
import { COPILOT_SDK_PROVIDER_NO_SUMMARY, COPILOT_SDK_PROVIDER_REQUEST_FAILED, extractAssistantText } from "./copilot-sdk-text.js";

export { COPILOT_SDK_PROVIDER_NO_SUMMARY, COPILOT_SDK_PROVIDER_REQUEST_FAILED } from "./copilot-sdk-text.js";

export type CopilotSdkProviderOptions = {
  model: string;
  requestTimeoutMs: number;
  maxSubagentParallelism?: number;
  clientOptions: Pick<
    import("@github/copilot-sdk").CopilotClientOptions,
    "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env" | "onListModels"
  >;
  sessionConfig: {
    provider?: import("@github/copilot-sdk").ProviderConfig;
    gitHubToken?: string;
    infiniteSessions?: import("@github/copilot-sdk").InfiniteSessionConfig;
    modelCapabilities?: import("@github/copilot-sdk").ModelCapabilitiesOverride;
    streaming?: boolean;
    includeSubAgentStreamingEvents?: boolean;
    enableConfigDiscovery?: boolean;
    configDir?: string;
    workingDirectory?: string;
    skillDirectories?: string[];
    disabledSkills?: string[];
  };
};

export class CopilotSdkProvider implements IntelligenceProvider {
  readonly id = "provider.copilot.sdk";
  private client: CopilotClient | null = null;
  private session: { sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown> } | null = null;
  private sessionPromise: Promise<{ sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown> }> | null = null;

  constructor(private readonly options: CopilotSdkProviderOptions) {}

  private async createSession(): Promise<CopilotSession> {
    const client = new CopilotClient(this.options.clientOptions);
    const guard = createAgentToolGuard();
    await client.start();
    const session = (await client.createSession({
      ...buildProviderSessionConfig(this.options),
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
    return runCopilotSdkAgent(this.options, prompt, tools, options);
  }
}
