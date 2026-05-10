import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import { ttyWriteLine, ttyWriteTagged } from "../shared/tty-log-format.js";

type EvalDimension = { id: string; score: number; rationale?: string };
type EvalReport = {
  weightedScore?: number;
  passed?: boolean;
  dimensions?: EvalDimension[];
  weaknesses?: string[];
  improvements?: string[];
  strengths?: string[];
};

type PipelineLog = {
  runId?: string;
  generatedAt?: string;
  diary?: string[];
  providerOutputs?: { summary?: string; documentationPlan?: string };
};

export async function runInspectInsights(workspaceDir: string, json: boolean): Promise<void> {
  let evalReport: EvalReport | null = null;
  let pipelineLog: PipelineLog | null = null;

  try {
    evalReport = JSON.parse(await readFile(join(workspaceStorageDir(workspaceDir), "reports", "evals", "dream-quality-eval.json"), "utf8")) as EvalReport;
  } catch {
    evalReport = null;
  }

  try {
    pipelineLog = JSON.parse(await readFile(join(workspaceStorageDir(workspaceDir), "reports", "pipeline-log.json"), "utf8")) as PipelineLog;
  } catch {
    pipelineLog = null;
  }

  if (!evalReport && !pipelineLog) {
    ttyWriteTagged("inspect", "no insights artifacts found. Run a dream cycle or quality eval first", { stream: process.stderr });
    process.exitCode = 1;
    return;
  }

  const payload = {
    latestRun: pipelineLog
      ? {
          runId: pipelineLog.runId,
          generatedAt: pipelineLog.generatedAt,
          providerSummary: pipelineLog.providerOutputs?.summary,
          diarySample: (pipelineLog.diary ?? []).slice(0, 10)
        }
      : null,
    quality: evalReport
      ? {
          weightedScore: evalReport.weightedScore,
          passed: evalReport.passed,
          dimensions: evalReport.dimensions,
          strengths: evalReport.strengths,
          weaknesses: evalReport.weaknesses,
          improvements: evalReport.improvements
        }
      : null
  };

  if (json) {
    ttyWriteLine(JSON.stringify(payload, null, 2));
    return;
  }

  ttyWriteTagged("inspect", "insights");
  if (payload.latestRun) {
    ttyWriteLine(`- latest run: ${payload.latestRun.runId ?? "unknown"} at ${payload.latestRun.generatedAt ?? "unknown"}`);
    if (payload.latestRun.providerSummary) {
      ttyWriteLine(`- provider summary: ${payload.latestRun.providerSummary.slice(0, 200)}`);
    }
  }
  if (payload.quality) {
    ttyWriteLine(`- quality: score=${payload.quality.weightedScore ?? 0} passed=${String(payload.quality.passed ?? false)}`);
    for (const dimension of payload.quality.dimensions ?? []) {
      ttyWriteLine(`  - ${dimension.id}: ${dimension.score}`);
    }
    for (const weakness of payload.quality.weaknesses?.slice(0, 5) ?? []) ttyWriteLine(`  weakness: ${weakness}`);
    for (const improvement of payload.quality.improvements?.slice(0, 5) ?? []) ttyWriteLine(`  improve: ${improvement}`);
  }
}