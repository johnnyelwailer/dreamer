import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathExists } from "./shared.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

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
    console.log("No metrics found. Run a dream cycle first.");
    process.exitCode = 1;
    return;
  }

  const metrics = JSON.parse(await readFile(metricsPath, "utf8")) as MetricsShape;
  console.log("Metrics summary");
  console.log(`- sessions processed: ${metrics.sessionsProcessed ?? 0}`);
  console.log(`- memories added: ${metrics.memoriesAdded ?? 0}`);
  console.log(`- memories updated: ${metrics.memoriesUpdated ?? 0}`);
  console.log(`- contradictions found: ${metrics.contradictionsFound ?? 0}`);
  console.log(`- docs generated: ${metrics.docsGenerated ?? 0}`);
  console.log(`- skill patches proposed: ${metrics.skillPatchesProposed ?? 0}`);
}

export async function runObservabilitySummary(workspaceDir: string): Promise<void> {
  const storageDir = workspaceStorageDir(workspaceDir);
  const artifacts = ["dream-diary.md", "governance.json", "metrics.json", "pipeline-log.json"];

  console.log("Status: report artifacts");
  let missing = 0;
  for (const name of artifacts) {
    const path = join(storageDir, "reports", name);
    if (!(await pathExists(path))) {
      console.log(`- missing: ${name}`);
      missing += 1;
      continue;
    }
    const info = await stat(path);
    console.log(`- ${name} (${info.size} bytes, updated ${info.mtime.toISOString()})`);
  }

  const pipelineLogPath = join(storageDir, "reports", "pipeline-log.json");
  if (await pathExists(pipelineLogPath)) {
    try {
      const parsed = JSON.parse(await readFile(pipelineLogPath, "utf8")) as PipelineLogShape;
      if (parsed.runId || parsed.generatedAt) {
        console.log("\nLatest run");
        if (parsed.runId) console.log(`- run id: ${parsed.runId}`);
        if (parsed.generatedAt) console.log(`- generated at: ${parsed.generatedAt}`);
      }
    } catch {
      console.log("\nCould not parse pipeline-log.json.");
    }
  }

  const statePath = join(workspaceStorageDir(workspaceDir), "state.json");
  if (await pathExists(statePath)) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8")) as StateShape;
      const progress = state.adapterProgress;
      if (progress) {
        console.log("\nBacklog progress");
        console.log(`- tracker: ${progress.label ?? "unknown"}`);
        console.log(`- complete: ${progress.completedUnits ?? 0}/${progress.totalUnits ?? 0} (${progress.completionPercent ?? 0}%)`);
        console.log(`- remaining: ${progress.remainingUnits ?? 0}`);
        console.log(`- processed this run: ${progress.processedThisRun ?? 0}`);
        if (progress.etaMinutes !== undefined) console.log(`- rough ETA: ${progress.etaMinutes} min`);
        if (progress.details) console.log(`- details: ${progress.details}`);
      }
      if (state.lastRunAt) console.log(`- state updated: ${state.lastRunAt}`);
    } catch {
      console.log("\nCould not parse state.json.");
    }
  }

  if (missing > 0) process.exitCode = 1;
}