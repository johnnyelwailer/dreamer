import { readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathExists } from "./shared.js";

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

export async function runMetricsSummary(workspaceDir: string): Promise<void> {
  const metricsPath = join(workspaceDir, "reports", "metrics.json");
  if (!(await pathExists(metricsPath))) {
    console.log("No metrics found at reports/metrics.json. Run a dream cycle first.");
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
  const artifacts = ["dream-diary.md", "governance.json", "metrics.json", "pipeline-log.json"];

  console.log("Status: report artifacts");
  let missing = 0;
  for (const name of artifacts) {
    const path = join(workspaceDir, "reports", name);
    if (!(await pathExists(path))) {
      console.log(`- missing: ${relative(workspaceDir, path)}`);
      missing += 1;
      continue;
    }
    const info = await stat(path);
    console.log(`- ${relative(workspaceDir, path)} (${info.size} bytes, updated ${info.mtime.toISOString()})`);
  }

  const pipelineLogPath = join(workspaceDir, "reports", "pipeline-log.json");
  if (await pathExists(pipelineLogPath)) {
    try {
      const parsed = JSON.parse(await readFile(pipelineLogPath, "utf8")) as PipelineLogShape;
      if (parsed.runId || parsed.generatedAt) {
        console.log("\nLatest run");
        if (parsed.runId) console.log(`- run id: ${parsed.runId}`);
        if (parsed.generatedAt) console.log(`- generated at: ${parsed.generatedAt}`);
      }
    } catch {
      console.log("\nCould not parse reports/pipeline-log.json.");
    }
  }

  if (missing > 0) process.exitCode = 1;
}