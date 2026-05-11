import type { ModelCapabilitiesOverride, ModelInfo, ProviderConfig } from "@github/copilot-sdk";
import type { RuntimeManifest } from "./runtime-manifest.js";

export function readEnvValue(primary?: string, fallback?: string): string | undefined {
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

export function buildClientEnv(extraEnvVars: string[]): Record<string, string | undefined> | undefined {
  if (!extraEnvVars.length) return undefined;
  const env: Record<string, string | undefined> = {};
  for (const envVar of extraEnvVars) env[envVar] = process.env[envVar];
  return env;
}

export function readPositiveIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function readBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return undefined;
}

export function readListEnv(name: string): string[] | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const values = raw
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return values.length > 0 ? values : undefined;
}

export function buildModelCapabilitiesOverride(): ModelCapabilitiesOverride | undefined {
  const maxContextWindowTokens = readPositiveIntEnv("COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS");
  const maxPromptTokens = readPositiveIntEnv("COPILOT_SDK_MAX_PROMPT_TOKENS") ?? maxContextWindowTokens;
  if (!maxContextWindowTokens && !maxPromptTokens) return undefined;
  return {
    limits: {
      ...(maxContextWindowTokens ? { max_context_window_tokens: maxContextWindowTokens } : {}),
      ...(maxPromptTokens ? { max_prompt_tokens: maxPromptTokens } : {})
    }
  };
}

export function buildByokOnListModels(model: string, modelCapabilities?: ModelCapabilitiesOverride): (() => ModelInfo[]) {
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

export function buildSessionProviderConfig(runtime: RuntimeManifest): ProviderConfig | undefined {
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

export function resolveMaxSubagentParallelism(runtime: RuntimeManifest): number | undefined {
  return readPositiveIntEnv("COPILOT_SDK_MAX_SUBAGENT_PARALLELISM") ?? runtime.provider.sdk.maxSubagentParallelism;
}