import type { RuntimeCopilotSdkByokConfig } from "./runtime-manifest-types.js";

export function parseByokConfig(sdk: Record<string, unknown>): RuntimeCopilotSdkByokConfig | undefined {
  const providerMode = asEnum(sdk.providerMode, ["copilot", "byok"] as const, "provider.sdk.providerMode");
  if (providerMode !== "byok") return undefined;

  const byok = sdk.byok as Record<string, unknown> | undefined;
  if (!byok) throw new Error("Invalid runtime manifest field: provider.sdk.byok");

  const config: RuntimeCopilotSdkByokConfig = {
    type: asEnum(byok.type, ["openai", "azure", "anthropic"] as const, "provider.sdk.byok.type"),
    wireApi: asEnum(byok.wireApi, ["completions", "responses"] as const, "provider.sdk.byok.wireApi"),
    baseUrl: asStringOrUndefined(byok.baseUrl, "provider.sdk.byok.baseUrl"),
    baseUrlEnvVar: asStringOrUndefined(byok.baseUrlEnvVar, "provider.sdk.byok.baseUrlEnvVar"),
    fallbackBaseUrlEnvVar: asStringOrUndefined(byok.fallbackBaseUrlEnvVar, "provider.sdk.byok.fallbackBaseUrlEnvVar"),
    apiKeyEnvVar: asStringOrUndefined(byok.apiKeyEnvVar, "provider.sdk.byok.apiKeyEnvVar"),
    fallbackApiKeyEnvVar: asStringOrUndefined(byok.fallbackApiKeyEnvVar, "provider.sdk.byok.fallbackApiKeyEnvVar"),
    bearerTokenEnvVar: asStringOrUndefined(byok.bearerTokenEnvVar, "provider.sdk.byok.bearerTokenEnvVar"),
    headers: byok.headers ? asRecordOfStrings(byok.headers, "provider.sdk.byok.headers") : undefined,
    azureApiVersion: asStringOrUndefined(byok.azureApiVersion, "provider.sdk.byok.azureApiVersion")
  };
  if (!config.baseUrl && !config.baseUrlEnvVar) {
    throw new Error("Invalid runtime manifest field: provider.sdk.byok.baseUrl or baseUrlEnvVar must be set");
  }
  return config;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asStringOrUndefined(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, field);
}

function asRecordOfStrings(value: unknown, field: string): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid runtime manifest field: ${field}`);
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, recordValue] of entries) {
    if (typeof key !== "string" || key.trim().length === 0 || typeof recordValue !== "string") {
      throw new Error(`Invalid runtime manifest field: ${field}`);
    }
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function asEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value as T;
}
