import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COPILOT_SDK_PROVIDER_REQUEST_FAILED, CopilotSdkProvider } from "../providers/copilot-sdk-provider.js";
import { buildCopilotSdkProviderOptions } from "../dream/copilot-sdk-options.js";
import { resolveAssetPath } from "../dream/dreamer-home.js";
import { runtimeManifestPath } from "../dream/runtime-manifest.js";
import { parseRuntimeManifestObject } from "../dream/runtime-manifest-parse.js";
import { readDotenvValues } from "./env.js";
import { pathExists } from "./shared.js";
import type { EnvWrite, SetupAnswers, SetupRuntime } from "./setup-wizard-types.js";

export async function ensureRuntimeManifest(workspaceDir: string): Promise<SetupRuntime> {
  const runtimePath = runtimeManifestPath(workspaceDir);
  if (!(await pathExists(runtimePath))) {
    await mkdir(join(runtimePath, ".."), { recursive: true });
    await writeFile(runtimePath, await readFile(resolveAssetPath("runtime-defaults.json"), "utf8"), "utf8");
  }
  return parseRuntimeManifestObject(JSON.parse(await readFile(runtimePath, "utf8")) as unknown);
}

export function applyAnswers(runtime: SetupRuntime, answers: SetupAnswers): SetupRuntime {
  const clientExtraEnvVars = new Set(runtime.provider.sdk.clientExtraEnvVars);
  if (answers.githubHost) clientExtraEnvVars.add("GITHUB_HOST");
  return {
    ...runtime,
    provider: {
      ...runtime.provider,
      id: "provider.copilot.sdk",
      defaultModel: answers.model,
      sdk: {
        ...runtime.provider.sdk,
        providerMode: answers.providerMode,
        authMode: answers.authMode,
        requestTimeoutMs: runtime.provider.sdk.requestTimeoutMs,
        maxSubagentParallelism: answers.maxSubagentParallelism ?? runtime.provider.sdk.maxSubagentParallelism,
        infiniteSessionsEnabled: runtime.provider.sdk.infiniteSessionsEnabled ?? true,
        gitHubTokenEnvVar: runtime.provider.sdk.gitHubTokenEnvVar ?? "GITHUB_TOKEN",
        sessionGitHubTokenEnvVar: runtime.provider.sdk.sessionGitHubTokenEnvVar ?? "COPILOT_SDK_SESSION_GITHUB_TOKEN",
        cliPathEnvVar: runtime.provider.sdk.cliPathEnvVar ?? "COPILOT_SDK_CLI_PATH",
        cliUrlEnvVar: runtime.provider.sdk.cliUrlEnvVar ?? "COPILOT_SDK_CLI_URL",
        clientExtraEnvVars: [...clientExtraEnvVars].sort(),
        byok: answers.providerMode === "byok"
          ? {
              type: answers.providerType,
              wireApi: answers.wireApi,
              ...(answers.baseUrl ? { baseUrl: answers.baseUrl } : {}),
              baseUrlEnvVar: answers.baseUrlEnv ?? "COPILOT_SDK_BASE_URL",
              fallbackBaseUrlEnvVar: "HOSTED_LLM_BASE_URL",
              apiKeyEnvVar: answers.apiKeyEnv ?? "COPILOT_SDK_API_KEY",
              fallbackApiKeyEnvVar: "HOSTED_LLM_API_KEY"
            }
          : runtime.provider.sdk.byok
      }
    },
    pipeline: {
      ...runtime.pipeline,
      stageOrder: answers.stageOrder?.length ? answers.stageOrder : runtime.pipeline.stageOrder
    },
    plugins: answers.pluginPaths.length
      ? { paths: [...new Set([...(runtime.plugins?.paths ?? []), ...answers.pluginPaths])] }
      : runtime.plugins
  };
}

export function envWrites(answers: SetupAnswers): EnvWrite[] {
  const writes: EnvWrite[] = [
    { name: "DREAM_ADAPTER_ID", value: answers.adapter },
    { name: "DREAM_BACKEND_ID", value: answers.backend },
    { name: "DREAM_PROVIDER_ID", value: answers.providerId }
  ];
  if (answers.providerMode === "byok") {
    writes.push({ name: answers.baseUrlEnv ?? "COPILOT_SDK_BASE_URL", value: answers.baseUrl ?? "" });
    writes.push({ name: answers.apiKeyEnv ?? "COPILOT_SDK_API_KEY", value: answers.apiKey ?? "" });
  }
  if (answers.authMode === "github-token") writes.push({ name: "GITHUB_TOKEN", value: "" });
  if (answers.authMode === "session-github-token") writes.push({ name: "COPILOT_SDK_SESSION_GITHUB_TOKEN", value: "" });
  if (answers.contextLength) writes.push({ name: "COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS", value: String(answers.contextLength) });
  if (answers.promptTokens) writes.push({ name: "COPILOT_SDK_MAX_PROMPT_TOKENS", value: String(answers.promptTokens) });
  if (answers.maxSubagentParallelism) {
    writes.push({ name: "COPILOT_SDK_MAX_SUBAGENT_PARALLELISM", value: String(answers.maxSubagentParallelism) });
  }
  if (answers.githubHost) writes.push({ name: "GITHUB_HOST", value: answers.githubHost });
  if (answers.pluginPaths.length) writes.push({ name: "DREAM_PLUGIN_PATHS", value: answers.pluginPaths.join(",") });
  return writes;
}

export async function upsertEnvFile(workspaceDir: string, writes: EnvWrite[]): Promise<void> {
  if (!writes.length) return;
  const envPath = join(workspaceDir, ".env.local");
  const existing = await readFile(envPath, "utf8").catch(() => "");
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  let changed = false;
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match?.[1]) return line;
    const write = writes.find((candidate) => candidate.name === match[1]);
    if (!write) return line;
    seen.add(write.name);
    if ((match[2] ?? "").trim().length > 0) return line;
    changed = true;
    return `${write.name}=${write.value}`;
  });
  const missing = writes.filter((write) => !seen.has(write.name));
  if (missing.length) {
    nextLines.push("", "# Added by dreamer setup", ...missing.map((write) => `${write.name}=${write.value}`));
    changed = true;
  }
  if (!changed) return;
  const content = `${nextLines.join("\n").replace(/\n+$/u, "")}\n`;
  if (existing) await writeFile(envPath, content, "utf8");
  else await appendFile(envPath, content, "utf8");
}

export async function verifyProvider(workspaceDir: string, runtime: SetupRuntime, model: string): Promise<string> {
  const values = await readDotenvValues(workspaceDir);
  for (const [key, value] of Object.entries(values)) process.env[key] ??= value;
  const provider = new CopilotSdkProvider(buildCopilotSdkProviderOptions(runtime, model, workspaceDir));
  try {
    const result = await provider.summarize("Reply with exactly: dreamer setup ok");
    if (result.startsWith(COPILOT_SDK_PROVIDER_REQUEST_FAILED)) return `fail: ${result}`;
    return result.toLowerCase().includes("dreamer setup ok")
      ? "ok: provider verification succeeded"
      : `warn: provider responded, but verification text did not match (${result.slice(0, 120)})`;
  } finally {
    await provider.dispose();
  }
}