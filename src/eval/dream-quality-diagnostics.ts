import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DreamConfig } from "../dream/config.js";

type FilePreview = {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  lineCount?: number;
  head?: string[];
  tail?: string[];
};

async function previewFile(path: string, maxLines = 6): Promise<FilePreview> {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const lines = raw.split("\n");
    return {
      path,
      exists: true,
      sizeBytes: info.size,
      lineCount: lines.length,
      head: lines.slice(0, maxLines),
      tail: lines.slice(Math.max(0, lines.length - maxLines))
    };
  } catch {
    return { path, exists: false };
  }
}

async function countMemoryRecords(path: string): Promise<number | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.records)) return record.records.length;
      if (Array.isArray(record.memory)) return record.memory.length;
    }
    return null;
  } catch {
    return null;
  }
}

async function buildTranscriptPreviews(config: DreamConfig): Promise<FilePreview[]> {
  if (config.adapterId === "adapter.copilot.debug") {
    return Promise.all([
      previewFile(join(config.copilotDebugSessionDir, "main.jsonl")),
      previewFile(join(config.copilotDebugSessionDir, "models.json"))
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
  const fileMemoryPath = join(workspaceDir, ".dreamer", "memory.json");
  const copilotMemoryPath = config.copilotMemoryPath;
  const honchoMemoryPath = config.honchoExportPath;

  const [transcriptPreviews, dreamDiary, governance, metrics, pipelineLog, fileMemCount, copilotMemCount, honchoMemCount] =
    await Promise.all([
      buildTranscriptPreviews(config),
      previewFile(join(workspaceDir, "reports", "dream-diary.md"), 20),
      previewFile(join(workspaceDir, "reports", "governance.json"), 40),
      previewFile(join(workspaceDir, "reports", "metrics.json"), 40),
      previewFile(join(workspaceDir, "reports", "pipeline-log.json"), 40),
      countMemoryRecords(fileMemoryPath),
      countMemoryRecords(copilotMemoryPath),
      countMemoryRecords(honchoMemoryPath)
    ]);

  return {
    runConfig: {
      adapterId: config.adapterId,
      backendId: config.backendId,
      providerId: config.providerId,
      model: config.copilotSdkModel
    },
    transcriptSources: transcriptPreviews,
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
