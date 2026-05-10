import type { RuntimeManifest } from "./runtime-manifest-types.js";
import { parseByokConfig } from "./runtime-manifest-byok-parse.js";
import { parseAgentPacks } from "./runtime-manifest-agent-packs-parse.js";
import { resolveAssetPath } from "./dreamer-home.js";
function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asStringOrDefault(value: unknown, defaultValue: string, field: string): string {
  if (value === undefined || value === null) return defaultValue;
  return asString(value, field);
}

function asStringOrUndefined(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, field);
}
function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}
function asEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value as T;
}
function asPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}
function asPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}
function asBoundedNumber(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}
function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid runtime manifest field: ${field}`);
  }
  return value;
}

function parseDiscoverySource(
  value: unknown,
  field: string
): {
  mode: "append" | "override";
  searchPaths: string[];
  lookbackDays?: number;
  maxSessionsPerRun?: number;
} | undefined {
  if (value === undefined) return undefined;
  const source = value as Record<string, unknown>;
  return {
    mode: source.mode ? asEnum(source.mode, ["append", "override"] as const, `${field}.mode`) : "append",
    searchPaths: source.searchPaths ? asStringArray(source.searchPaths, `${field}.searchPaths`) : [],
    lookbackDays:
      source.lookbackDays === undefined
        ? undefined
        : asPositiveNumber(source.lookbackDays, `${field}.lookbackDays`),
    maxSessionsPerRun:
      source.maxSessionsPerRun === undefined
        ? undefined
        : asPositiveInteger(source.maxSessionsPerRun, `${field}.maxSessionsPerRun`)
  };
}

export function parseRuntimeManifestObject(parsed: unknown): RuntimeManifest {
  const root = parsed as Record<string, unknown>;
  const provider = root.provider as Record<string, unknown> | undefined;
  const pipeline = root.pipeline as Record<string, unknown> | undefined;
  const docs = root.docs as Record<string, unknown> | undefined;
  const evalConfig = root.eval as Record<string, unknown> | undefined;
  const discovery = root.discovery as Record<string, unknown> | undefined;
  if (!provider || !pipeline || !docs || !evalConfig) throw new Error("Invalid runtime manifest structure");

  const sdk = provider.sdk as Record<string, unknown> | undefined;
  if (!sdk) throw new Error("Invalid runtime manifest field: provider.sdk");
  const quality = evalConfig.quality as Record<string, unknown> | undefined;
  if (!quality) throw new Error("Invalid runtime manifest field: eval.quality");

  return {
    provider: {
      id: asString(provider.id, "provider.id"),
      defaultModel: asString(provider.defaultModel, "provider.defaultModel"),
      sdk: {
        authMode: asEnum(sdk.authMode, ["none", "logged-in-user", "github-token", "session-github-token"] as const, "provider.sdk.authMode"),
        providerMode: asEnum(sdk.providerMode, ["copilot", "byok"] as const, "provider.sdk.providerMode"),
        requestTimeoutMs: asPositiveInteger(sdk.requestTimeoutMs, "provider.sdk.requestTimeoutMs"),
        infiniteSessionsEnabled:
          sdk.infiniteSessionsEnabled === undefined
            ? undefined
            : asBoolean(sdk.infiniteSessionsEnabled, "provider.sdk.infiniteSessionsEnabled"),
        gitHubTokenEnvVar: asStringOrUndefined(sdk.gitHubTokenEnvVar, "provider.sdk.gitHubTokenEnvVar"),
        sessionGitHubTokenEnvVar: asStringOrUndefined(sdk.sessionGitHubTokenEnvVar, "provider.sdk.sessionGitHubTokenEnvVar"),
        cliPathEnvVar: asStringOrUndefined(sdk.cliPathEnvVar, "provider.sdk.cliPathEnvVar"),
        cliUrlEnvVar: asStringOrUndefined(sdk.cliUrlEnvVar, "provider.sdk.cliUrlEnvVar"),
        clientExtraEnvVars: sdk.clientExtraEnvVars ? asStringArray(sdk.clientExtraEnvVars, "provider.sdk.clientExtraEnvVars") : [],
        byok: parseByokConfig(sdk)
      }
    },
    pipeline: {
      stageOrder: asStringArray(pipeline.stageOrder, "pipeline.stageOrder"),
      agentPacks: parseAgentPacks(pipeline.agentPacks, "pipeline.agentPacks")
    },
    docs: {
      outputRootPath: asString(docs.outputRootPath, "docs.outputRootPath"),
      fallbackOutputPath: asString(docs.fallbackOutputPath, "docs.fallbackOutputPath"),
      promptTemplatePath: asStringOrDefault(docs.promptTemplatePath, resolveAssetPath("prompts/docs-generation.md"), "docs.promptTemplatePath"),
      improvementHintsPath: asStringOrDefault(docs.improvementHintsPath, resolveAssetPath("prompts/docs-improvement-hints.md"), "docs.improvementHintsPath"),
      maxSignals: asPositiveInteger(docs.maxSignals, "docs.maxSignals"),
      maxMemories: asPositiveInteger(docs.maxMemories, "docs.maxMemories"),
      maxEvents: asPositiveInteger(docs.maxEvents, "docs.maxEvents")
    },
    eval: {
      casesPath: asStringOrDefault(evalConfig.casesPath, resolveAssetPath("evals/copilot-sdk-cases.json"), "eval.casesPath"),
      reportPath: asString(evalConfig.reportPath, "eval.reportPath"),
      requestTimeoutMs: asPositiveInteger(evalConfig.requestTimeoutMs, "eval.requestTimeoutMs"),
      maxAttempts: asPositiveInteger(evalConfig.maxAttempts, "eval.maxAttempts"),
      quality: {
        rubricPath: asStringOrDefault(quality.rubricPath, resolveAssetPath("evals/dream-quality-rubric.json"), "eval.quality.rubricPath"),
        reportPath: asString(quality.reportPath, "eval.quality.reportPath"),
        selfImproveReportPath: asString(quality.selfImproveReportPath, "eval.quality.selfImproveReportPath"),
        minPassingScore: asBoundedNumber(quality.minPassingScore, 0, 1, "eval.quality.minPassingScore"),
        maxHintsToPersist: asPositiveNumber(quality.maxHintsToPersist, "eval.quality.maxHintsToPersist")
      }
    },
    discovery: discovery
      ? {
          copilotDebug: parseDiscoverySource(discovery.copilotDebug, "discovery.copilotDebug"),
          claudeCode: parseDiscoverySource(discovery.claudeCode, "discovery.claudeCode"),
          codexTrace: parseDiscoverySource(discovery.codexTrace, "discovery.codexTrace")
        }
      : undefined
  };
}

