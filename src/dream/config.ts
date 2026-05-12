import { join } from "node:path";
import { readRuntimeManifest } from "./runtime-manifest.js";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { RuntimeStageAgentPackConfig } from "./runtime-manifest.js";
import { buildCopilotSdkProviderOptions } from "./copilot-sdk-options.js";
import { discoverCopilotDebugSessionDir } from "./copilot-debug-session-discovery.js";
import { discoverClaudeCodeLogPath, discoverCodexTraceLogPath } from "./adapter-log-discovery.js";
import { defaultCopilotMemoryTarget } from "./copilot-memory-path.js";
import { loadWorkspaceDotenv, readList, readPositiveInteger, readPositiveNumber } from "./config-env.js";
import { workspaceStorageDir } from "./dreamer-home.js";
import { readBoolean, readHonchoEnvironment, readSessionScopeMode, type HonchoEnvironment } from "./config-readers.js";
import { mergeStageImplementationBindings, normalizeStageSlotId, parseStageImplementationBindings } from "./stage-implementation-config.js";
import type { CopilotSessionScopeMode } from "../adapters/copilot-debug/types.js";

export type DreamConfig = {
  adapterId: string;
  backendId: string;
  providerId: string;
  stageOrder: string[];
  stageImplementations: Record<string, string>;
  stageAgentPacks?: Record<string, RuntimeStageAgentPackConfig>;
  pluginPaths?: string[];
  minSessions: number;
  copilotDebugSessionDir: string;
  copilotDebugDiscoveryMode: "append" | "override";
  copilotDebugSearchPaths: string[];
  copilotDebugLookbackDays?: number;
  copilotDebugMaxSessionsPerRun?: number;
  copilotDebugBatchSessions: number;
  copilotDebugSessionScopeMode: CopilotSessionScopeMode;
  jsonlEventsPath: string;
  claudeCodePath: string;
  codexTracePath: string;
  terminalCastPath: string;
  browserHarPath: string;
  copilotMemoryPath: string;
  memoryBackupEnabled: boolean;
  memoryBackupDir: string;
  memoryBackupExternalOnly: boolean;
  honchoExportPath: string;
  honchoWorkspaceId: string;
  honchoApiKey?: string;
  honchoBaseUrl?: string;
  honchoEnvironment?: HonchoEnvironment;
  copilotSdkModel: string;
  copilotSdkProviderOptions: CopilotSdkProviderOptions;
  docsOutputRootPath: string;
  docsFallbackOutputPath: string;
  docsPromptTemplatePath: string;
  docsImprovementHintsPath: string;
  docsMaxSignals: number;
  docsMaxMemories: number;
  docsMaxEvents: number;
};

export function readDreamConfig(workspaceDir: string): DreamConfig {
  const envSourceDir = process.env.DREAMER_ENV_SOURCE_DIR;
  try {
    loadWorkspaceDotenv(workspaceDir);
  } catch {
    // Missing .env.local is expected.
  }
  if (envSourceDir && envSourceDir !== workspaceDir) {
    try {
      loadWorkspaceDotenv(envSourceDir);
    } catch {
      // Missing source .env.local is expected.
    }
  }
  const storageDir = workspaceStorageDir(workspaceDir);
  const fixturesDir = join(storageDir, "fixtures");
  const runtime = readRuntimeManifest(workspaceDir);
  const stageOrderOverride = readList(process.env.DREAM_STAGE_ORDER);
  const stageImplementationOverride = parseStageImplementationBindings(process.env.DREAM_STAGE_IMPLEMENTATIONS);
  const copilotSdkModel = process.env.COPILOT_SDK_MODEL ?? runtime.provider.defaultModel;
  const discoveredCopilotDebugSessionDir = discoverCopilotDebugSessionDir({
    searchPaths: runtime.discovery?.copilotDebug?.searchPaths,
    mode: runtime.discovery?.copilotDebug?.mode,
    lookbackDays: runtime.discovery?.copilotDebug?.lookbackDays
  });
  const discoveredClaudeCodePath = discoverClaudeCodeLogPath({
    searchPaths: runtime.discovery?.claudeCode?.searchPaths,
    mode: runtime.discovery?.claudeCode?.mode
  });
  const discoveredCodexTracePath = discoverCodexTraceLogPath({
    searchPaths: runtime.discovery?.codexTrace?.searchPaths,
    mode: runtime.discovery?.codexTrace?.mode
  });
  return {
    adapterId: process.env.DREAM_ADAPTER_ID ?? "adapter.copilot.debug",
    backendId: process.env.DREAM_BACKEND_ID ?? "backend.file.memory",
    providerId: process.env.DREAM_PROVIDER_ID ?? runtime.provider.id,
    stageOrder: (stageOrderOverride.length > 0 ? stageOrderOverride : runtime.pipeline.stageOrder)
      .map(normalizeStageSlotId),
    stageImplementations: mergeStageImplementationBindings(runtime.pipeline.stageImplementations, stageImplementationOverride),
    stageAgentPacks: runtime.pipeline.agentPacks,
    pluginPaths: runtime.plugins?.paths ?? [],
    minSessions: Number(process.env.DREAM_MIN_SESSIONS ?? "1"),
    copilotDebugSessionDir:
      process.env.COPILOT_DEBUG_SESSION_DIR ??
      discoveredCopilotDebugSessionDir ??
      join(fixturesDir, "copilot-session"),
    copilotDebugDiscoveryMode: runtime.discovery?.copilotDebug?.mode ?? "append",
    copilotDebugSearchPaths: runtime.discovery?.copilotDebug?.searchPaths ?? [],
    copilotDebugLookbackDays:
      readPositiveNumber(process.env.DREAM_COPILOT_LOOKBACK_DAYS) ?? runtime.discovery?.copilotDebug?.lookbackDays,
    copilotDebugMaxSessionsPerRun:
      readPositiveInteger(process.env.DREAM_COPILOT_MAX_SESSIONS_PER_RUN) ??
      runtime.discovery?.copilotDebug?.maxSessionsPerRun,
    copilotDebugBatchSessions: readPositiveInteger(process.env.DREAM_COPILOT_BATCH_SESSIONS) ?? 3,
    copilotDebugSessionScopeMode:
      readSessionScopeMode(process.env.DREAM_COPILOT_SESSION_SCOPE_MODE) ?? "newest-first",
    jsonlEventsPath: process.env.DREAM_JSONL_EVENTS_FILE ?? join(fixturesDir, "events.jsonl"),
    claudeCodePath:
      process.env.DREAM_CLAUDE_CODE_FILE ?? discoveredClaudeCodePath ?? join(fixturesDir, "claude-code.jsonl"),
    codexTracePath:
      process.env.DREAM_CODEX_TRACE_FILE ?? discoveredCodexTracePath ?? join(fixturesDir, "codex.jsonl"),
    terminalCastPath: process.env.DREAM_TERMINAL_CAST_FILE ?? join(fixturesDir, "terminal.cast"),
    browserHarPath: process.env.DREAM_BROWSER_TRACE_FILE ?? join(fixturesDir, "browser.har"),
    copilotMemoryPath: process.env.DREAM_COPILOT_MEMORY_FILE ?? defaultCopilotMemoryTarget(workspaceDir),
    memoryBackupEnabled: readBoolean(process.env.DREAM_MEMORY_BACKUP_ENABLED, true),
    memoryBackupDir: process.env.DREAM_MEMORY_BACKUP_DIR ?? join(storageDir, "backups", "memories"),
    memoryBackupExternalOnly: readBoolean(process.env.DREAM_MEMORY_BACKUP_EXTERNAL_ONLY, true),
    honchoExportPath:
      process.env.DREAM_HONCHO_WORKSPACE_FILE ?? join(storageDir, "honcho", "workspace.json"),
    honchoWorkspaceId: process.env.DREAM_HONCHO_WORKSPACE_ID ?? process.env.HONCHO_WORKSPACE_ID ?? "dreamer",
    honchoApiKey: process.env.DREAM_HONCHO_API_KEY ?? process.env.HONCHO_API_KEY,
    honchoBaseUrl: process.env.DREAM_HONCHO_BASE_URL ?? process.env.HONCHO_URL,
    honchoEnvironment: readHonchoEnvironment(process.env.DREAM_HONCHO_ENVIRONMENT),
    copilotSdkModel,
    copilotSdkProviderOptions: buildCopilotSdkProviderOptions(runtime, copilotSdkModel, workspaceDir),
    docsOutputRootPath: runtime.docs.outputRootPath,
    docsFallbackOutputPath: runtime.docs.fallbackOutputPath,
    docsPromptTemplatePath: runtime.docs.promptTemplatePath,
    docsImprovementHintsPath: runtime.docs.improvementHintsPath,
    docsMaxSignals: runtime.docs.maxSignals,
    docsMaxMemories: runtime.docs.maxMemories,
    docsMaxEvents: runtime.docs.maxEvents
  };
}
