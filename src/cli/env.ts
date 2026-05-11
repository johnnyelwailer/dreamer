import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readRuntimeManifest } from "../dream/runtime-manifest.js";

export type EnvSnapshot = {
  process: Record<string, string>;
  dotenv: Record<string, string>;
};

export async function readDotenvValues(workspaceDir: string): Promise<Record<string, string>> {
  const envPath = join(workspaceDir, ".env.local");
  try {
    const raw = await readFile(envPath, "utf8");
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = match[2]?.trim() ?? "";
      if (!value) continue;
      out[key] = value.replace(/^['"]|['"]$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

export async function buildEnvSnapshot(workspaceDir: string): Promise<EnvSnapshot> {
  const processValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string" && value.trim().length > 0) processValues[key] = value;
  }
  return { process: processValues, dotenv: await readDotenvValues(workspaceDir) };
}

export function envValue(name: string | undefined, env: EnvSnapshot): string | undefined {
  if (!name) return undefined;
  return env.process[name] ?? env.dotenv[name];
}

export function envValueSource(name: string | undefined, env: EnvSnapshot): "process" | "dotenv" | "unset" {
  if (!name) return "unset";
  if (env.process[name]) return "process";
  if (env.dotenv[name]) return "dotenv";
  return "unset";
}

export function collectProviderEnvVarNames(workspaceDir: string): string[] {
  const runtime = readRuntimeManifest(workspaceDir);
  const sdk = runtime.provider.sdk;
  const names = new Set<string>();

  if (sdk.authMode === "github-token" && sdk.gitHubTokenEnvVar) names.add(sdk.gitHubTokenEnvVar);
  if (sdk.authMode === "session-github-token" && sdk.sessionGitHubTokenEnvVar) names.add(sdk.sessionGitHubTokenEnvVar);
  if (sdk.cliPathEnvVar) names.add(sdk.cliPathEnvVar);
  if (sdk.cliUrlEnvVar) names.add(sdk.cliUrlEnvVar);
  names.add("COPILOT_SDK_MAX_SUBAGENT_PARALLELISM");
  for (const extra of sdk.clientExtraEnvVars) names.add(extra);

  if (sdk.providerMode === "byok" && sdk.byok) {
    if (sdk.byok.baseUrlEnvVar) names.add(sdk.byok.baseUrlEnvVar);
    if (sdk.byok.fallbackBaseUrlEnvVar) names.add(sdk.byok.fallbackBaseUrlEnvVar);
    if (sdk.byok.apiKeyEnvVar) names.add(sdk.byok.apiKeyEnvVar);
    if (sdk.byok.fallbackApiKeyEnvVar) names.add(sdk.byok.fallbackApiKeyEnvVar);
    if (sdk.byok.bearerTokenEnvVar) names.add(sdk.byok.bearerTokenEnvVar);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}