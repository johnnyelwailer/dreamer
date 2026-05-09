import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseRuntimeManifestObject
} from "./runtime-manifest-parse.js";
import { parseDreamQualityRubricObject, parseEvalCasesObject } from "./runtime-manifest-content-parse.js";
import type { DreamQualityRubricConfig, EvalCaseConfig, RuntimeManifest } from "./runtime-manifest-types.js";

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
  return join(workspaceDir, ".dreamer", "config", "runtime.json");
}

export function readRuntimeManifest(workspaceDir: string): RuntimeManifest {
  const path = runtimeManifestPath(workspaceDir);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseRuntimeManifestObject(parsed);
}

export function readEvalCases(workspaceDir: string, manifest: RuntimeManifest): EvalCaseConfig[] {
  const path = resolveWorkspacePath(workspaceDir, manifest.eval.casesPath);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseEvalCasesObject(parsed, "eval.cases");
}

export function readDreamQualityRubric(workspaceDir: string, manifest: RuntimeManifest): DreamQualityRubricConfig {
  const path = resolveWorkspacePath(workspaceDir, manifest.eval.quality.rubricPath);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseDreamQualityRubricObject(parsed, "eval.quality.rubric");
}
