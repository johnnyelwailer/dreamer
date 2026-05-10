import chalk from "chalk";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join, relative } from "node:path";
import { COPILOT_SDK_PROVIDER_REQUEST_FAILED, CopilotSdkProvider } from "../providers/copilot-sdk-provider.js";
import { buildCopilotSdkProviderOptions } from "../dream/copilot-sdk-options.js";
import { resolveAssetPath } from "../dream/dreamer-home.js";
import { runtimeManifestPath } from "../dream/runtime-manifest.js";
import { ttyWriteLine } from "../shared/tty-log-format.js";
import type {
  CopilotSdkAuthMode,
  CopilotSdkProviderMode,
  CopilotSdkProviderType,
  CopilotSdkWireApi,
  RuntimeManifest
} from "../dream/runtime-manifest.js";
import { parseRuntimeManifestObject } from "../dream/runtime-manifest-parse.js";
import { readDotenvValues } from "./env.js";
import { pathExists } from "./shared.js";

type SetupOptions = {
  interactive?: boolean;
  adapter?: string;
  adapterPath?: string;
  backend?: string;
  providerMode?: CopilotSdkProviderMode;
  authMode?: CopilotSdkAuthMode;
  model?: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  providerType?: CopilotSdkProviderType;
  wireApi?: CopilotSdkWireApi;
  contextLength?: string;
  promptTokens?: string;
  githubHost?: string;
  pluginPath?: string[];
  providerId?: string;
  stageOrder?: string;
  verify?: boolean;
  yes?: boolean;
};

type SetupAnswers = Required<Pick<SetupOptions, "providerMode" | "authMode" | "providerType" | "wireApi">> & {
  adapter: string;
  backend: string;
  model: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  contextLength?: number;
  promptTokens?: number;
  githubHost?: string;
  pluginPaths: string[];
  providerId: string;
  stageOrder?: string[];
  verify: boolean;
};

type EnvWrite = {
  name: string;
  value: string;
};

const BUILT_IN_STAGE_ORDER = [
  "stage.orientation",
  "stage.signal",
  "stage.consolidation",
  "stage.documentation",
  "stage.skills",
  "stage.governance",
  "stage.observability"
];

const ADAPTERS = [
  { id: "adapter.copilot.debug", label: "Copilot debug sessions" },
  { id: "adapter.codex.trace", label: "Codex history" },
  { id: "adapter.claude.code", label: "Claude Code history" },
  { id: "adapter.jsonl.event", label: "Custom JSONL event file" },
  { id: "custom", label: "Custom adapter plugin" }
];

const BACKENDS = [
  { id: "backend.file.memory", label: "Local Dreamer memory file" },
  { id: "backend.copilot.memory", label: "VS Code/Copilot-style local memory file" },
  { id: "backend.honcho.memory", label: "Honcho" },
  { id: "custom", label: "Custom memory plugin" }
];

async function ensureRuntimeManifest(workspaceDir: string): Promise<RuntimeManifest> {
  const runtimePath = runtimeManifestPath(workspaceDir);
  if (!(await pathExists(runtimePath))) {
    await mkdir(join(runtimePath, ".."), { recursive: true });
    await writeFile(runtimePath, await readFile(resolveAssetPath("runtime-defaults.json"), "utf8"), "utf8");
  }
  const raw = await readFile(runtimePath, "utf8");
  return parseRuntimeManifestObject(JSON.parse(raw) as unknown);
}

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isInteractive(options: SetupOptions): boolean {
  return Boolean(input.isTTY && output.isTTY && !options.yes && options.interactive);
}

async function select(
  rl: ReturnType<typeof createInterface>,
  title: string,
  choices: Array<{ id: string; label: string }>,
  defaultId: string
): Promise<string> {
  output.write(`\n${chalk.bold(title)}\n`);
  choices.forEach((choice, index) => {
    const suffix = choice.id === defaultId ? chalk.dim(" default") : "";
    output.write(`  ${index + 1}. ${choice.label}${suffix}\n`);
  });
  const answer = (await rl.question(chalk.cyan("Choose: "))).trim();
  if (!answer) return defaultId;
  const selectedIndex = Number.parseInt(answer, 10);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
    return choices[selectedIndex - 1].id;
  }
  const found = choices.find((choice) => choice.id === answer);
  if (found) return found.id;
  output.write(chalk.yellow(`Unknown choice, using ${defaultId}.\n`));
  return defaultId;
}

async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue?: string
): Promise<string | undefined> {
  const suffix = defaultValue ? chalk.dim(` (${defaultValue})`) : "";
  const answer = (await rl.question(`${chalk.cyan(prompt)}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function confirm(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${chalk.cyan(prompt)} ${chalk.dim(suffix)}: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "1", "true"].includes(answer);
}

async function collectInteractive(runtime: RuntimeManifest): Promise<SetupAnswers> {
  const rl = createInterface({ input, output });
  try {
    output.write(`\n${chalk.bold("Dreamer setup")}\n`);
    output.write(chalk.dim("This uses the bundled runtime config plus local env defaults where needed.\n"));

    const adapterChoice = await select(rl, "1. Context provider", ADAPTERS, "adapter.copilot.debug");
    const pluginPaths: string[] = [];
    let adapter = adapterChoice;
    if (adapterChoice === "custom") {
      adapter = (await ask(rl, "Custom adapter id", "adapter.custom")) ?? "adapter.custom";
      const pluginPath = await ask(rl, "Adapter plugin path");
      if (pluginPath) pluginPaths.push(pluginPath);
    }

    const internalPipeline = await confirm(rl, "\n2. Use the built-in dream pipeline?", true);
    const stageOrder = internalPipeline
      ? undefined
      : splitList(await ask(rl, "Comma-separated stage ids", BUILT_IN_STAGE_ORDER.join(",")));

    const providerMode = (await select(
      rl,
      "3. Intelligence provider",
      [
        { id: "copilot", label: "Copilot SDK with GitHub login" },
        { id: "byok", label: "BYOK or OpenAI-compatible endpoint" },
        { id: "custom", label: "Custom intelligence provider plugin" }
      ],
      runtime.provider.sdk.providerMode
    )) as CopilotSdkProviderMode | "custom";

    const providerId =
      providerMode === "custom"
        ? (await ask(rl, "Custom provider id", "provider.custom")) ?? "provider.custom"
        : "provider.copilot.sdk";
    if (providerMode === "custom") {
      const pluginPath = await ask(rl, "Provider plugin path");
      if (pluginPath) pluginPaths.push(pluginPath);
    }

    const authMode =
      providerMode === "byok" || providerMode === "custom"
        ? "none"
        : ((await select(
            rl,
            "Authentication",
            [
              { id: "logged-in-user", label: "Logged-in GitHub user" },
              { id: "github-token", label: "GitHub token for client auth" },
              { id: "session-github-token", label: "GitHub token per session" }
            ],
            runtime.provider.sdk.authMode === "none" ? "logged-in-user" : runtime.provider.sdk.authMode
          )) as CopilotSdkAuthMode);

    const model = (await ask(rl, "Model", runtime.provider.defaultModel)) ?? runtime.provider.defaultModel;
    const effectiveProviderMode = providerMode === "custom" ? runtime.provider.sdk.providerMode : providerMode;
    const githubHost = providerMode === "copilot" ? await ask(rl, "GitHub Enterprise host, if any") : undefined;
    const baseUrl = providerMode === "byok" ? await ask(rl, "Endpoint base URL", "http://localhost:11434/v1") : undefined;
    const apiKey = providerMode === "byok" ? await ask(rl, "API key, if required") : undefined;
    const contextLength = parsePositiveInt(await ask(rl, "Context window tokens", "65536"), "context window tokens");
    const promptTokens = parsePositiveInt(await ask(rl, "Max prompt tokens, optional"), "max prompt tokens");

    const backendChoice = await select(rl, "4. Memory system", BACKENDS, "backend.file.memory");
    let backend = backendChoice;
    if (backendChoice === "custom") {
      backend = (await ask(rl, "Custom backend id", "backend.custom")) ?? "backend.custom";
      const pluginPath = await ask(rl, "Memory plugin path");
      if (pluginPath) pluginPaths.push(pluginPath);
    }

    const extraPlugin = await ask(rl, "\nAdditional plugin path, if any");
    if (extraPlugin) pluginPaths.push(extraPlugin);
    const verify = await confirm(rl, "Run provider verification now?", true);

    return {
      adapter,
      backend,
      providerMode: effectiveProviderMode,
      authMode,
      model,
      baseUrl,
      apiKey,
      providerType: "openai",
      wireApi: "completions",
      contextLength,
      promptTokens,
      githubHost,
      pluginPaths,
      providerId,
      stageOrder,
      verify
    };
  } finally {
    rl.close();
  }
}

function collectNonInteractive(options: SetupOptions, runtime: RuntimeManifest): SetupAnswers {
  const providerMode = options.providerMode ?? runtime.provider.sdk.providerMode;
  const authMode = options.authMode ?? runtime.provider.sdk.authMode;
  const providerType = options.providerType ?? "openai";
  const wireApi = options.wireApi ?? "completions";
  if (!["copilot", "byok"].includes(providerMode)) throw new Error("--provider-mode must be copilot or byok.");
  if (!["none", "logged-in-user", "github-token", "session-github-token"].includes(authMode)) {
    throw new Error("--auth-mode must be none, logged-in-user, github-token, or session-github-token.");
  }
  if (!["openai", "azure", "anthropic"].includes(providerType)) {
    throw new Error("--provider-type must be openai, azure, or anthropic.");
  }
  if (!["completions", "responses"].includes(wireApi)) throw new Error("--wire-api must be completions or responses.");
  return {
    adapter: options.adapter ?? "adapter.copilot.debug",
    backend: options.backend ?? "backend.file.memory",
    providerMode,
    authMode,
    model: options.model ?? runtime.provider.defaultModel,
    baseUrl: options.baseUrl,
    baseUrlEnv: options.baseUrlEnv,
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv,
    providerType,
    wireApi,
    contextLength: parsePositiveInt(options.contextLength, "--context-length"),
    promptTokens: parsePositiveInt(options.promptTokens, "--prompt-tokens"),
    githubHost: options.githubHost,
    pluginPaths: [...(options.pluginPath ?? []), ...(options.adapterPath ? [options.adapterPath] : [])],
    providerId: options.providerId ?? "provider.copilot.sdk",
    stageOrder: splitList(options.stageOrder),
    verify: options.verify ?? false
  };
}

function applyAnswers(runtime: RuntimeManifest, answers: SetupAnswers): RuntimeManifest {
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
        infiniteSessionsEnabled: runtime.provider.sdk.infiniteSessionsEnabled ?? true,
        gitHubTokenEnvVar: runtime.provider.sdk.gitHubTokenEnvVar ?? "GITHUB_TOKEN",
        sessionGitHubTokenEnvVar:
          runtime.provider.sdk.sessionGitHubTokenEnvVar ?? "COPILOT_SDK_SESSION_GITHUB_TOKEN",
        cliPathEnvVar: runtime.provider.sdk.cliPathEnvVar ?? "COPILOT_SDK_CLI_PATH",
        cliUrlEnvVar: runtime.provider.sdk.cliUrlEnvVar ?? "COPILOT_SDK_CLI_URL",
        clientExtraEnvVars: [...clientExtraEnvVars].sort(),
        byok:
          answers.providerMode === "byok"
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
      ? {
          paths: [...new Set([...(runtime.plugins?.paths ?? []), ...answers.pluginPaths])]
        }
      : runtime.plugins
  };
}

function envWrites(answers: SetupAnswers): EnvWrite[] {
  const writes: EnvWrite[] = [
    { name: "DREAM_ADAPTER_ID", value: answers.adapter },
    { name: "DREAM_BACKEND_ID", value: answers.backend },
    { name: "DREAM_PROVIDER_ID", value: answers.providerId }
  ];
  if (answers.providerMode === "byok") {
    const baseUrlName = answers.baseUrlEnv ?? "COPILOT_SDK_BASE_URL";
    const apiKeyName = answers.apiKeyEnv ?? "COPILOT_SDK_API_KEY";
    writes.push({ name: baseUrlName, value: answers.baseUrl ?? "" });
    writes.push({ name: apiKeyName, value: answers.apiKey ?? "" });
  }
  if (answers.authMode === "github-token") {
    writes.push({ name: "GITHUB_TOKEN", value: "" });
  }
  if (answers.authMode === "session-github-token") {
    writes.push({ name: "COPILOT_SDK_SESSION_GITHUB_TOKEN", value: "" });
  }
  if (answers.contextLength) {
    writes.push({ name: "COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS", value: String(answers.contextLength) });
  }
  if (answers.promptTokens) writes.push({ name: "COPILOT_SDK_MAX_PROMPT_TOKENS", value: String(answers.promptTokens) });
  if (answers.githubHost) writes.push({ name: "GITHUB_HOST", value: answers.githubHost });
  if (answers.pluginPaths.length) writes.push({ name: "DREAM_PLUGIN_PATHS", value: answers.pluginPaths.join(",") });
  return writes;
}

async function upsertEnvFile(workspaceDir: string, writes: EnvWrite[]): Promise<void> {
  if (!writes.length) return;
  const envPath = join(workspaceDir, ".env.local");
  let existing = "";
  try {
    existing = await readFile(envPath, "utf8");
  } catch {
    existing = "";
  }
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
  if (existing) await writeFile(envPath, `${nextLines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
  else await appendFile(envPath, `${nextLines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

async function applyEnvForVerification(workspaceDir: string): Promise<void> {
  const values = await readDotenvValues(workspaceDir);
  for (const [key, value] of Object.entries(values)) {
    process.env[key] ??= value;
  }
}

async function verifyProvider(workspaceDir: string, runtime: RuntimeManifest, model: string): Promise<string> {
  await applyEnvForVerification(workspaceDir);
  const provider = new CopilotSdkProvider(buildCopilotSdkProviderOptions(runtime, model, workspaceDir));
  try {
    const result = await provider.summarize("Reply with exactly: dreamer setup ok");
    if (result.startsWith(COPILOT_SDK_PROVIDER_REQUEST_FAILED)) return `fail: ${result}`;
    if (!result.toLowerCase().includes("dreamer setup ok")) {
      return `warn: provider responded, but verification text did not match (${result.slice(0, 120)})`;
    }
    return "ok: provider verification succeeded";
  } finally {
    await provider.dispose();
  }
}

export async function runSetupWizard(workspaceDir: string, options: SetupOptions): Promise<void> {
  const runtime = await ensureRuntimeManifest(workspaceDir);
  const answers = isInteractive(options) ? await collectInteractive(runtime) : collectNonInteractive(options, runtime);
  const nextRuntime = applyAnswers(runtime, answers);
  const runtimePath = runtimeManifestPath(workspaceDir);

  await mkdir(join(runtimePath, ".."), { recursive: true });
  await writeFile(runtimePath, `${JSON.stringify(nextRuntime, null, 2)}\n`, "utf8");
  await upsertEnvFile(workspaceDir, envWrites(answers));

  ttyWriteLine(chalk.bold("\nSetup complete"));
  ttyWriteLine(`- runtime config: ${relative(workspaceDir, runtimePath)}`);
  ttyWriteLine(`- context provider: ${answers.adapter}`);
  ttyWriteLine(`- dream pipeline: ${(answers.stageOrder ?? BUILT_IN_STAGE_ORDER).join(",")}`);
  ttyWriteLine(
    `- intelligence: ${
      answers.providerId === "provider.copilot.sdk"
        ? `${answers.providerMode}/${answers.authMode} model=${answers.model}`
        : `${answers.providerId} (plugin)`
    }`
  );
  ttyWriteLine(`- memory: ${answers.backend}`);

  if (answers.verify && answers.providerId !== "provider.copilot.sdk") {
    ttyWriteLine("- verification: skipped for custom provider plugins");
  } else if (answers.verify) {
    const message = await verifyProvider(workspaceDir, nextRuntime, answers.model).catch((error) => {
      return `fail: ${error instanceof Error ? error.message : String(error)}`;
    });
    ttyWriteLine(`- verification: ${message}`);
    if (message.startsWith("fail:")) process.exitCode = 1;
  } else {
    ttyWriteLine("- verification: skipped");
  }
}
