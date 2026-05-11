import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseRuntimeManifestObject
} from "./runtime-manifest-parse.js";
import { parseDreamQualityRubricObject, parseEvalCasesObject } from "./runtime-manifest-content-parse.js";
import type { DreamQualityRubricConfig, EvalCaseConfig, RuntimeManifest } from "./runtime-manifest-types.js";
import { resolveAssetPath, workspaceStorageDir } from "./dreamer-home.js";

export type {
  CopilotSdkAuthMode,
  DiscoveryMode,
  CopilotSdkProviderMode,
  CopilotSdkProviderType,
  CopilotSdkWireApi,
  DreamQualityDimensionConfig,
  DreamQualityRubricConfig,
  EvalCaseConfig,
  RuntimeDiscoverySourceConfig,
  RuntimeDefaultAgentConfig,
  RuntimeCustomAgentConfig,
  RuntimeAgentPackExecutionConfig,
  RuntimeStageAgentPackConfig,
  RuntimeCopilotSdkByokConfig,
  RuntimeCopilotSdkConfig,
  RuntimeManifest
} from "./runtime-manifest-types.js";

export function resolveWorkspacePath(workspaceDir: string, relativePath: string): string {
  return join(workspaceDir, relativePath);
}

export function runtimeManifestPath(workspaceDir: string): string {
  const configured = process.env.DREAM_RUNTIME_CONFIG_FILE;
  if (configured && configured.trim().length > 0) return configured;
  return join(workspaceStorageDir(workspaceDir), "runtime.json");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function mergeToolLists(first: unknown, second: unknown): string[] | undefined {
  if (!Array.isArray(first) && !Array.isArray(second)) return undefined;
  return [...new Set([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])])]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mergeBundledAgentPacks(parsed: unknown, mergeDefaults: boolean): unknown {
  const root = asRecord(parsed);
  const pipeline = asRecord(root?.pipeline);
  if (!root || !pipeline) return parsed;

  const defaults = asRecord(JSON.parse(readFileSync(resolveAssetPath("runtime-defaults.json"), "utf8")) as unknown);
  const defaultPipeline = asRecord(defaults?.pipeline);
  const bundledPacks = asRecord(defaultPipeline?.agentPacks);
  if (!bundledPacks) return parsed;
  if (pipeline.agentPacks === undefined) {
    return { ...root, pipeline: { ...pipeline, agentPacks: bundledPacks } };
  }
  if (!mergeDefaults) return parsed;

  const localPacks = asRecord(pipeline.agentPacks);
  if (!localPacks) return parsed;
  const agentPacks: Record<string, unknown> = { ...localPacks };
  for (const [stageId, bundledPack] of Object.entries(bundledPacks)) {
    const bundled = asRecord(bundledPack);
    const local = asRecord(localPacks[stageId]);
    if (!bundled || !local) continue;
    const bundledDefault = asRecord(bundled.defaultAgent);
    const localDefault = asRecord(local.defaultAgent);
    const excludedTools = mergeToolLists(bundledDefault?.excludedTools, localDefault?.excludedTools);
    agentPacks[stageId] = excludedTools ? { ...local, defaultAgent: { ...localDefault, excludedTools } } : local;
  }

  return {
    ...root,
    pipeline: {
      ...pipeline,
      agentPacks
    }
  };
}

export function readRuntimeManifest(workspaceDir: string): RuntimeManifest {
  const path = runtimeManifestPath(workspaceDir);
  const explicitRuntimeFile = Boolean(process.env.DREAM_RUNTIME_CONFIG_FILE?.trim());
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    raw = readFileSync(resolveAssetPath("runtime-defaults.json"), "utf8");
  }
  const parsed = mergeBundledAgentPacks(JSON.parse(raw) as unknown, !explicitRuntimeFile);
  return parseRuntimeManifestObject(parsed);
}

export function readEvalCases(workspaceDir: string, manifest: RuntimeManifest): EvalCaseConfig[] {
  const path = manifest.eval.casesPath;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseEvalCasesObject(parsed, "eval.cases");
}

export function readDreamQualityRubric(workspaceDir: string, manifest: RuntimeManifest): DreamQualityRubricConfig {
  const path = manifest.eval.quality.rubricPath;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseDreamQualityRubricObject(parsed, "eval.quality.rubric");
}
