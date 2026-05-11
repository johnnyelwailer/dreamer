import { join } from "node:path";
import type { ModelCapabilitiesOverride, ModelInfo, ProviderConfig } from "@github/copilot-sdk";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { RuntimeManifest } from "./runtime-manifest.js";
import { dreamerHome } from "./dreamer-home.js";
import {
  buildClientEnv,
  buildByokOnListModels,
  buildModelCapabilitiesOverride,
  buildSessionProviderConfig,
  resolveMaxSubagentParallelism,
  readBooleanEnv,
  readListEnv,
  readEnvValue,
  readPositiveIntEnv
} from "./copilot-sdk-options-helpers.js";

export function buildCopilotSdkProviderOptions(
  runtime: RuntimeManifest,
  model: string,
  workspaceDir: string
): CopilotSdkProviderOptions {
  const sdk = runtime.provider.sdk;
  const modelCapabilities = buildModelCapabilitiesOverride();
  const clientOptions: CopilotSdkProviderOptions["clientOptions"] = {
    useLoggedInUser: sdk.authMode === "logged-in-user",
    cliPath: readEnvValue(sdk.cliPathEnvVar),
    cliUrl: readEnvValue(sdk.cliUrlEnvVar),
    env: buildClientEnv(sdk.clientExtraEnvVars)
  };

  if (sdk.providerMode === "byok") {
    clientOptions.onListModels = buildByokOnListModels(model, modelCapabilities);
  }

  if (sdk.authMode === "github-token") {
    clientOptions.gitHubToken = readEnvValue(sdk.gitHubTokenEnvVar);
    clientOptions.useLoggedInUser = false;
  }

  const sessionConfig: CopilotSdkProviderOptions["sessionConfig"] = {
    provider: buildSessionProviderConfig(runtime),
    infiniteSessions: { enabled: runtime.provider.sdk.infiniteSessionsEnabled ?? true },
    modelCapabilities,
    streaming: readBooleanEnv("COPILOT_SDK_STREAMING"),
    includeSubAgentStreamingEvents: readBooleanEnv("COPILOT_SDK_INCLUDE_SUBAGENT_STREAMING_EVENTS"),
    enableConfigDiscovery: readBooleanEnv("COPILOT_SDK_ENABLE_CONFIG_DISCOVERY"),
    workingDirectory: workspaceDir,
    configDir: process.env.DREAM_COPILOT_SDK_CONFIG_DIR ?? join(dreamerHome(), "copilot-sdk"),
    skillDirectories: readListEnv("COPILOT_SDK_SKILL_DIRECTORIES"),
    disabledSkills: readListEnv("COPILOT_SDK_DISABLED_SKILLS")
  };
  if (sdk.authMode === "session-github-token") {
    sessionConfig.gitHubToken = readEnvValue(sdk.sessionGitHubTokenEnvVar);
  }

  return {
    model,
    requestTimeoutMs: sdk.requestTimeoutMs,
    maxSubagentParallelism: resolveMaxSubagentParallelism(runtime),
    clientOptions,
    sessionConfig
  };
}
