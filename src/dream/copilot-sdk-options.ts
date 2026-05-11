import { join } from "node:path";
import type { ModelCapabilitiesOverride, ModelInfo, ProviderConfig } from "@github/copilot-sdk";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { RuntimeManifest } from "./runtime-manifest.js";
import { dreamerHome } from "./dreamer-home.js";

function readEnvValue(primary?: string, fallback?: string): string | undefined {
  if (primary) {
    const primaryValue = process.env[primary];
    if (primaryValue && primaryValue.trim().length > 0) return primaryValue;
  }
  if (fallback) {
    const fallbackValue = process.env[fallback];
    if (fallbackValue && fallbackValue.trim().length > 0) return fallbackValue;
  }
  return undefined;
}

function buildClientEnv(extraEnvVars: string[]): Record<string, string | undefined> | undefined {
  if (!extraEnvVars.length) return undefined;
  const env: Record<string, string | undefined> = {};
  for (const envVar of extraEnvVars) env[envVar] = process.env[envVar];
  return env;
}

function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function readBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return undefined;
}

function buildModelCapabilitiesOverride(): ModelCapabilitiesOverride | undefined {
  const maxContextWindowTokens = readPositiveIntEnv("COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS");
  const maxPromptTokens = readPositiveIntEnv("COPILOT_SDK_MAX_PROMPT_TOKENS");
  if (!maxContextWindowTokens && !maxPromptTokens) return undefined;
  return {
    limits: {
      ...(maxContextWindowTokens ? { max_context_window_tokens: maxContextWindowTokens } : {}),
      ...(maxPromptTokens ? { max_prompt_tokens: maxPromptTokens } : {})
    }
  };
}

function buildByokOnListModels(model: string, modelCapabilities?: ModelCapabilitiesOverride): (() => ModelInfo[]) {
  return () => {
    const limits = modelCapabilities?.limits;
    const modelLimits = {
      max_context_window_tokens: limits?.max_context_window_tokens ?? 65536,
      ...(limits?.max_prompt_tokens ? { max_prompt_tokens: limits.max_prompt_tokens } : {})
    };

    return [
      {
        id: model,
        name: model,
        capabilities: {
          supports: { vision: false, reasoningEffort: false },
          limits: modelLimits
        }
      }
    ];
  };
}

function buildSessionProviderConfig(runtime: RuntimeManifest): ProviderConfig | undefined {
  const sdk = runtime.provider.sdk;
  if (sdk.providerMode !== "byok") return undefined;
  const byok = sdk.byok;
  if (!byok) throw new Error("Invalid runtime manifest: provider.sdk.byok is required when providerMode=byok");

  const baseUrl = byok.baseUrl ?? readEnvValue(byok.baseUrlEnvVar, byok.fallbackBaseUrlEnvVar);
  if (!baseUrl) return undefined;

  const provider: ProviderConfig = {
    type: byok.type,
    wireApi: byok.wireApi,
    baseUrl,
    headers: byok.headers
  };
  const apiKey = readEnvValue(byok.apiKeyEnvVar, byok.fallbackApiKeyEnvVar);
  const bearerToken = readEnvValue(byok.bearerTokenEnvVar);
  if (apiKey) provider.apiKey = apiKey;
  if (bearerToken) provider.bearerToken = bearerToken;
  if (byok.type === "azure" && byok.azureApiVersion) provider.azure = { apiVersion: byok.azureApiVersion };
  return provider;
}

function resolveMaxSubagentParallelism(runtime: RuntimeManifest): number | undefined {
  return readPositiveIntEnv("COPILOT_SDK_MAX_SUBAGENT_PARALLELISM") ?? runtime.provider.sdk.maxSubagentParallelism;
}

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
    workingDirectory: workspaceDir,
    configDir: process.env.DREAM_COPILOT_SDK_CONFIG_DIR ?? join(dreamerHome(), "copilot-sdk")
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
