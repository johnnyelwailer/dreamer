import type { ProviderConfig } from "@github/copilot-sdk";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { RuntimeManifest } from "./runtime-manifest.js";

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

export function buildCopilotSdkProviderOptions(runtime: RuntimeManifest, model: string): CopilotSdkProviderOptions {
  const sdk = runtime.provider.sdk;
  const clientOptions: CopilotSdkProviderOptions["clientOptions"] = {
    useLoggedInUser: sdk.authMode === "logged-in-user",
    cliPath: readEnvValue(sdk.cliPathEnvVar),
    cliUrl: readEnvValue(sdk.cliUrlEnvVar),
    env: buildClientEnv(sdk.clientExtraEnvVars)
  };

  if (sdk.authMode === "github-token") {
    clientOptions.gitHubToken = readEnvValue(sdk.gitHubTokenEnvVar);
    clientOptions.useLoggedInUser = false;
  }

  const sessionConfig: CopilotSdkProviderOptions["sessionConfig"] = {
    provider: buildSessionProviderConfig(runtime),
    infiniteSessions: { enabled: runtime.provider.sdk.infiniteSessionsEnabled ?? false }
  };
  if (sdk.authMode === "session-github-token") {
    sessionConfig.gitHubToken = readEnvValue(sdk.sessionGitHubTokenEnvVar);
  }

  return {
    model,
    requestTimeoutMs: sdk.requestTimeoutMs,
    clientOptions,
    sessionConfig
  };
}
