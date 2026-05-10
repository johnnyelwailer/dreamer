import { basename, join } from "node:path";
import type { DreamConfig } from "../dream/config.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import {
  previewFile,
  countMemoryRecords,
  readMemoryStatements,
  readProviderSummaryPreview,
  summarizeCopilotTranscript,
  type FilePreview
} from "./dream-quality-diagnostics-helpers.js";

async function buildTranscriptPreviews(config: DreamConfig): Promise<FilePreview[]> {
  if (config.adapterId === "adapter.copilot.debug") {
    return Promise.all([
      previewFile(join(config.copilotDebugSessionDir, "main.jsonl")),
      previewFile(join(config.copilotDebugSessionDir, "models.json")),
      previewFile(join(config.copilotDebugSessionDir, "..", "..", "transcripts", `${basename(config.copilotDebugSessionDir)}.jsonl`), 12)
    ]);
  }

  const candidatePaths: string[] = [];
  if (config.adapterId === "adapter.jsonl.event") candidatePaths.push(config.jsonlEventsPath);
  if (config.adapterId === "adapter.claude.code") candidatePaths.push(config.claudeCodePath);
  if (config.adapterId === "adapter.codex.trace") candidatePaths.push(config.codexTracePath);
  if (config.adapterId === "adapter.terminal.recording") candidatePaths.push(config.terminalCastPath);
  if (config.adapterId === "adapter.browser.trace") candidatePaths.push(config.browserHarPath);
  return Promise.all(candidatePaths.map((path) => previewFile(path)));
}

export async function buildDreamQualityDiagnostics(workspaceDir: string, config: DreamConfig): Promise<unknown> {
  const storageDir = workspaceStorageDir(workspaceDir);
  const fileMemoryPath = join(storageDir, "memory.json");
  const copilotMemoryPath = config.copilotMemoryPath;
  const honchoMemoryPath = config.honchoExportPath;
  const pipelineLogPath = join(storageDir, "reports", "pipeline-log.json");

  const [
    transcriptPreviews,
    transcriptSummary,
    dreamDiary,
    governance,
    metrics,
    pipelineLog,
    fileMemCount,
    copilotMemCount,
    honchoMemCount,
    memoryStatements,
    providerSummaryPreview
  ] =
    await Promise.all([
      buildTranscriptPreviews(config),
      config.adapterId === "adapter.copilot.debug" ? summarizeCopilotTranscript(config.copilotDebugSessionDir) : undefined,
      previewFile(join(storageDir, "reports", "dream-diary.md"), 20),
      previewFile(join(storageDir, "reports", "governance.json"), 40),
      previewFile(join(storageDir, "reports", "metrics.json"), 40),
      previewFile(pipelineLogPath, 40),
      countMemoryRecords(fileMemoryPath),
      countMemoryRecords(copilotMemoryPath),
      countMemoryRecords(honchoMemoryPath),
      readMemoryStatements([copilotMemoryPath, fileMemoryPath, honchoMemoryPath]),
      readProviderSummaryPreview(pipelineLogPath)
    ]);

  return {
    runConfig: {
      adapterId: config.adapterId,
      backendId: config.backendId,
      providerId: config.providerId,
      model: config.copilotSdkModel
    },
    transcriptSources: transcriptPreviews,
    transcriptSummary,
    derivedConclusions: {
      memoryStatements,
      providerSummaryPreview
    },
    memoryOutputs: [
      { path: fileMemoryPath, records: fileMemCount },
      { path: copilotMemoryPath, records: copilotMemCount },
      { path: honchoMemoryPath, records: honchoMemCount }
    ],
    pipelineArtifacts: {
      dreamDiary,
      governance,
      metrics,
      pipelineLog
    }
  };
}
