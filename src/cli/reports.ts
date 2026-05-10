import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathExists } from "./shared.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import { ttyWriteLine, ttyWriteTagged } from "../shared/tty-log-format.js";

type MetricsShape = {
  sessionsProcessed?: number;
  memoriesAdded?: number;
  memoriesUpdated?: number;
  contradictionsFound?: number;
  docsGenerated?: number;
  skillPatchesProposed?: number;
};

type PipelineLogShape = {
  runId?: string;
  generatedAt?: string;
};

type StateShape = {
  adapterProgress?: {
    label?: string;
    totalUnits?: number;
    completedUnits?: number;
    remainingUnits?: number;
    completionPercent?: number;
    processedThisRun?: number;
    etaMinutes?: number;
    details?: string;
  };
  lastRunAt?: string;
};

export async function runMetricsSummary(workspaceDir: string): Promise<void> {
  const metricsPath = join(workspaceStorageDir(workspaceDir), "reports", "metrics.json");
  if (!(await pathExists(metricsPath))) {
    ttyWriteTagged("reports", "no metrics found. Run a dream cycle first", { stream: process.stderr });
    process.exitCode = 1;
    return;
  }

  const metrics = JSON.parse(await readFile(metricsPath, "utf8")) as MetricsShape;
  ttyWriteTagged("reports", "metrics summary");
  ttyWriteLine(`- sessions processed: ${metrics.sessionsProcessed ?? 0}`);
  ttyWriteLine(`- memories added: ${metrics.memoriesAdded ?? 0}`);
  ttyWriteLine(`- memories updated: ${metrics.memoriesUpdated ?? 0}`);
  ttyWriteLine(`- contradictions found: ${metrics.contradictionsFound ?? 0}`);
  ttyWriteLine(`- docs generated: ${metrics.docsGenerated ?? 0}`);
  ttyWriteLine(`- skill patches proposed: ${metrics.skillPatchesProposed ?? 0}`);
}

export async function runObservabilitySummary(workspaceDir: string): Promise<void> {
  const storageDir = workspaceStorageDir(workspaceDir);
  const artifacts = ["dream-diary.md", "governance.json", "metrics.json", "pipeline-log.json"];

  ttyWriteTagged("reports", "status: report artifacts");
  let missing = 0;
  for (const name of artifacts) {
    const path = join(storageDir, "reports", name);
    if (!(await pathExists(path))) {
      ttyWriteLine(`- missing: ${name}`);
      missing += 1;
      continue;
    }
    const info = await stat(path);
    ttyWriteLine(`- ${name} (${info.size} bytes, updated ${info.mtime.toISOString()})`);
  }

  const pipelineLogPath = join(storageDir, "reports", "pipeline-log.json");
  if (await pathExists(pipelineLogPath)) {
    try {
      const parsed = JSON.parse(await readFile(pipelineLogPath, "utf8")) as PipelineLogShape;
      if (parsed.runId || parsed.generatedAt) {
        ttyWriteLine("\nLatest run");
        if (parsed.runId) ttyWriteLine(`- run id: ${parsed.runId}`);
        if (parsed.generatedAt) ttyWriteLine(`- generated at: ${parsed.generatedAt}`);
      }
    } catch {
      ttyWriteLine("\nCould not parse pipeline-log.json.");
    }
  }

  const statePath = join(workspaceStorageDir(workspaceDir), "state.json");
  if (await pathExists(statePath)) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8")) as StateShape;
      const progress = state.adapterProgress;
      if (progress) {
        ttyWriteLine("\nBacklog progress");
        ttyWriteLine(`- tracker: ${progress.label ?? "unknown"}`);
        ttyWriteLine(`- complete: ${progress.completedUnits ?? 0}/${progress.totalUnits ?? 0} (${progress.completionPercent ?? 0}%)`);
        ttyWriteLine(`- remaining: ${progress.remainingUnits ?? 0}`);
        ttyWriteLine(`- processed this run: ${progress.processedThisRun ?? 0}`);
        if (progress.etaMinutes !== undefined) ttyWriteLine(`- rough ETA: ${progress.etaMinutes} min`);
        if (progress.details) ttyWriteLine(`- details: ${progress.details}`);
      }
      if (state.lastRunAt) ttyWriteLine(`- state updated: ${state.lastRunAt}`);
    } catch {
      ttyWriteLine("\nCould not parse state.json.");
    }
  }

  if (missing > 0) process.exitCode = 1;
}