import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CopilotSdkAuthMode, CopilotSdkProviderMode } from "../dream/runtime-manifest.js";
import { ADAPTERS, BACKENDS, BUILT_IN_STAGE_ORDER, type SetupAnswers, type SetupOptions, type SetupRuntime } from "./setup-wizard-types.js";
import { ask, confirm, parsePositiveInt, select, splitList } from "./setup-wizard-shared.js";

export async function collectInteractive(runtime: SetupRuntime): Promise<SetupAnswers> {
  const rl = createInterface({ input, output });
  try {
    output.write(`\n${chalk.bold("Dreamer setup")}\n`);
    output.write(chalk.dim("This uses the bundled runtime config plus local env defaults where needed.\n"));

    const adapterChoice = await select(rl, "1. Context provider", ADAPTERS, "adapter.copilot.debug");
    const pluginPaths: string[] = [];
    const adapter = await resolveCustomChoice(rl, adapterChoice, "adapter.custom", "Custom adapter id", "Adapter plugin path", pluginPaths);
    const stageOrder = await promptStageOrder(rl);
    const { providerMode, providerId } = await promptProviderChoice(rl, runtime, pluginPaths);
    const authMode = await promptAuthMode(rl, runtime, providerMode);
    const model = (await ask(rl, "Model", runtime.provider.defaultModel)) ?? runtime.provider.defaultModel;
    const githubHost = providerMode === "copilot" ? await ask(rl, "GitHub Enterprise host, if any") : undefined;
    const baseUrl = providerMode === "byok" ? await ask(rl, "Endpoint base URL", "http://localhost:11434/v1") : undefined;
    const apiKey = providerMode === "byok" ? await ask(rl, "API key, if required") : undefined;
    const contextLength = parsePositiveInt(await ask(rl, "Context window tokens", "65536"), "context window tokens");
    const promptTokens = parsePositiveInt(await ask(rl, "Max prompt tokens, optional"), "max prompt tokens");
    const maxSubagentParallelism = parsePositiveInt(
      await ask(
        rl,
        "Max parallel subagents, optional",
        runtime.provider.sdk.maxSubagentParallelism ? String(runtime.provider.sdk.maxSubagentParallelism) : ""
      ),
      "max parallel subagents"
    );
    const backendChoice = await select(rl, "4. Memory system", BACKENDS, "backend.file.memory");
    const backend = await resolveCustomChoice(rl, backendChoice, "backend.custom", "Custom backend id", "Memory plugin path", pluginPaths);
    const extraPlugin = await ask(rl, "\nAdditional plugin path, if any");
    if (extraPlugin) pluginPaths.push(extraPlugin);

    return {
      adapter,
      backend,
      providerMode: providerMode === "custom" ? runtime.provider.sdk.providerMode : providerMode,
      authMode,
      model,
      baseUrl,
      apiKey,
      providerType: "openai",
      wireApi: "completions",
      contextLength,
      promptTokens,
      maxSubagentParallelism,
      githubHost,
      pluginPaths,
      providerId,
      stageOrder,
      verify: await confirm(rl, "Run provider verification now?", true)
    };
  } finally {
    rl.close();
  }
}

export function collectNonInteractive(options: SetupOptions, runtime: SetupRuntime): SetupAnswers {
  const providerMode = options.providerMode ?? runtime.provider.sdk.providerMode;
  const authMode = options.authMode ?? runtime.provider.sdk.authMode;
  const providerType = options.providerType ?? "openai";
  const wireApi = options.wireApi ?? "completions";
  if (!["copilot", "byok"].includes(providerMode)) throw new Error("--provider-mode must be copilot or byok.");
  if (!["none", "logged-in-user", "github-token", "session-github-token"].includes(authMode)) throw new Error("--auth-mode must be none, logged-in-user, github-token, or session-github-token.");
  if (!["openai", "azure", "anthropic"].includes(providerType)) throw new Error("--provider-type must be openai, azure, or anthropic.");
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
    maxSubagentParallelism: parsePositiveInt(options.maxSubagentParallelism, "--max-subagent-parallelism"),
    githubHost: options.githubHost,
    pluginPaths: [...(options.pluginPath ?? []), ...(options.adapterPath ? [options.adapterPath] : [])],
    providerId: options.providerId ?? "provider.copilot.sdk",
    stageOrder: splitList(options.stageOrder),
    verify: options.verify ?? false
  };
}

async function promptStageOrder(rl: ReturnType<typeof createInterface>): Promise<string[] | undefined> {
  const internalPipeline = await confirm(rl, "\n2. Use the built-in dream pipeline?", true);
  return internalPipeline ? undefined : splitList(await ask(rl, "Comma-separated stage ids", BUILT_IN_STAGE_ORDER.join(",")));
}

async function promptProviderChoice(rl: ReturnType<typeof createInterface>, runtime: SetupRuntime, pluginPaths: string[]) {
  const providerMode = (await select(rl, "3. Intelligence provider", [
    { id: "copilot", label: "Copilot SDK with GitHub login" },
    { id: "byok", label: "BYOK or OpenAI-compatible endpoint" },
    { id: "custom", label: "Custom intelligence provider plugin" }
  ], runtime.provider.sdk.providerMode)) as CopilotSdkProviderMode | "custom";
  const providerId = providerMode === "custom"
    ? (await ask(rl, "Custom provider id", "provider.custom")) ?? "provider.custom"
    : "provider.copilot.sdk";
  if (providerMode === "custom") {
    const pluginPath = await ask(rl, "Provider plugin path");
    if (pluginPath) pluginPaths.push(pluginPath);
  }
  return { providerMode, providerId };
}

async function promptAuthMode(rl: ReturnType<typeof createInterface>, runtime: SetupRuntime, providerMode: CopilotSdkProviderMode | "custom") {
  if (providerMode === "byok" || providerMode === "custom") return "none";
  return (await select(rl, "Authentication", [
    { id: "logged-in-user", label: "Logged-in GitHub user" },
    { id: "github-token", label: "GitHub token for client auth" },
    { id: "session-github-token", label: "GitHub token per session" }
  ], runtime.provider.sdk.authMode === "none" ? "logged-in-user" : runtime.provider.sdk.authMode)) as CopilotSdkAuthMode;
}

async function resolveCustomChoice(
  rl: ReturnType<typeof createInterface>,
  choice: string,
  defaultId: string,
  prompt: string,
  pluginPrompt: string,
  pluginPaths: string[]
): Promise<string> {
  if (choice !== "custom") return choice;
  const customId = (await ask(rl, prompt, defaultId)) ?? defaultId;
  const pluginPath = await ask(rl, pluginPrompt);
  if (pluginPath) pluginPaths.push(pluginPath);
  return customId;
}