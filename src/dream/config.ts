import { join } from "node:path";
import { readRuntimeManifest } from "./runtime-manifest.js";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import { buildCopilotSdkProviderOptions } from "./copilot-sdk-options.js";
import { discoverCopilotDebugSessionDir } from "./copilot-debug-session-discovery.js";
import { discoverClaudeCodeLogPath, discoverCodexTraceLogPath } from "./adapter-log-discovery.js";

type HonchoEnvironment = "local" | "production";

function readHonchoEnvironment(value: string | undefined): HonchoEnvironment | undefined {
  if (value === "local" || value === "production") return value;
  return undefined;
}

export type DreamConfig = {
  adapterId: string;
  backendId: string;
  providerId: string;
  stageOrder: string[];
  minSessions: number;
  copilotDebugSessionDir: string;
  jsonlEventsPath: string;
  claudeCodePath: string;
  codexTracePath: string;
  terminalCastPath: string;
  browserHarPath: string;
  copilotMemoryPath: string;
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
  const fixturesDir = join(workspaceDir, ".dreamer", "fixtures");
  const runtime = readRuntimeManifest(workspaceDir);
  const copilotSdkModel = process.env.COPILOT_SDK_MODEL ?? runtime.provider.defaultModel;
  const discoveredCopilotDebugSessionDir = discoverCopilotDebugSessionDir({
    searchPaths: runtime.discovery?.copilotDebug?.searchPaths,
    mode: runtime.discovery?.copilotDebug?.mode
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
    stageOrder: runtime.pipeline.stageOrder,
    minSessions: Number(process.env.DREAM_MIN_SESSIONS ?? "1"),
    copilotDebugSessionDir:
      process.env.COPILOT_DEBUG_SESSION_DIR ??
      discoveredCopilotDebugSessionDir ??
      join(fixturesDir, "copilot-session"),
    jsonlEventsPath: process.env.DREAM_JSONL_EVENTS_FILE ?? join(fixturesDir, "events.jsonl"),
    claudeCodePath:
      process.env.DREAM_CLAUDE_CODE_FILE ?? discoveredClaudeCodePath ?? join(fixturesDir, "claude-code.jsonl"),
    codexTracePath:
      process.env.DREAM_CODEX_TRACE_FILE ?? discoveredCodexTracePath ?? join(fixturesDir, "codex.jsonl"),
    terminalCastPath: process.env.DREAM_TERMINAL_CAST_FILE ?? join(fixturesDir, "terminal.cast"),
    browserHarPath: process.env.DREAM_BROWSER_TRACE_FILE ?? join(fixturesDir, "browser.har"),
    copilotMemoryPath:
      process.env.DREAM_COPILOT_MEMORY_FILE ?? join(workspaceDir, ".dreamer", "copilot-memory.json"),
    honchoExportPath:
      process.env.DREAM_HONCHO_WORKSPACE_FILE ?? join(workspaceDir, ".dreamer", "honcho", "workspace.json"),
    honchoWorkspaceId: process.env.DREAM_HONCHO_WORKSPACE_ID ?? process.env.HONCHO_WORKSPACE_ID ?? "dreamer",
    honchoApiKey: process.env.DREAM_HONCHO_API_KEY ?? process.env.HONCHO_API_KEY,
    honchoBaseUrl: process.env.DREAM_HONCHO_BASE_URL ?? process.env.HONCHO_URL,
    honchoEnvironment: readHonchoEnvironment(process.env.DREAM_HONCHO_ENVIRONMENT),
    copilotSdkModel,
    copilotSdkProviderOptions: buildCopilotSdkProviderOptions(runtime, copilotSdkModel),
    docsOutputRootPath: runtime.docs.outputRootPath,
    docsFallbackOutputPath: runtime.docs.fallbackOutputPath,
    docsPromptTemplatePath: runtime.docs.promptTemplatePath,
    docsImprovementHintsPath: runtime.docs.improvementHintsPath,
    docsMaxSignals: runtime.docs.maxSignals,
    docsMaxMemories: runtime.docs.maxMemories,
    docsMaxEvents: runtime.docs.maxEvents
  };
}
