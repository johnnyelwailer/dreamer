import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readDreamConfig } from "../dream/config.js";
import {
  readDreamQualityRubric,
  readRuntimeManifest,
  type DreamQualityRubricConfig
} from "../dream/runtime-manifest.js";
import { runDream } from "../dream/run-dream.js";
import { createAdapter } from "../dream/adapter-factory.js";
import { discoverCopilotDebugSessions } from "../dream/copilot-debug-session-discovery.js";
import {
  buildRubricText,
  scoreReport
} from "./dream-quality-helpers.js";
import type { DreamQualityReport } from "./dream-quality-types.js";
import { buildDreamQualityDiagnostics } from "./dream-quality-diagnostics.js";
import { runToolContractJudge } from "./dream-quality-tool-judge.js";
import { buildEvidenceToolingSection, resolveJudgeEvidenceFiles, resolveMemoryOutputFiles, resolveStagePromptFiles } from "./dream-quality-evidence.js";
import { deriveJudgeErrorDiagnostics } from "./judge-error-diagnostics.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import { createTtyStatus } from "../shared/tty-progress.js";

/**
 * Pick a stratified sample: 1 long, 1 medium, 2 short — totalling ~4 sessions.
 * Falls back gracefully when fewer sessions exist.
 */
function sampleSessionPaths(config: ReturnType<typeof readDreamConfig>): string[] | undefined {
  if (config.adapterId !== "adapter.copilot.debug") return undefined;
  const sessions = discoverCopilotDebugSessions({
    searchPaths: config.copilotDebugSearchPaths,
    mode: config.copilotDebugDiscoveryMode,
    lookbackDays: config.copilotDebugLookbackDays
  });
  if (sessions.length <= 4) return undefined; // already small enough, no sampling needed
  const sorted = [...sessions].sort((a, b) => a.transcriptLineCount - b.transcriptLineCount);
  const n = sorted.length;
  const sample: typeof sorted = [];
  // 2 shortest
  sample.push(sorted[0]);
  if (n > 1) sample.push(sorted[1]);
  // 1 median
  const mid = Math.floor(n / 2);
  const median = sorted[mid];
  if (!sample.includes(median)) sample.push(median);
  // 1 longest
  const longest = sorted[n - 1];
  if (!sample.includes(longest)) sample.push(longest);
  return sample.map((s) => s.path);
}

type RunQualityEvalOptions = { replayTranscripts?: boolean };
export async function runDreamQualityEval(
  workspaceDir: string,
  options: RunQualityEvalOptions = {}
): Promise<DreamQualityReport> {
  const status = createTtyStatus("[eval:dream-quality]");
  status.update(`start workspace=${workspaceDir}`);
  const config = readDreamConfig(workspaceDir);
  const sessionPathAllowlist = sampleSessionPaths(config);
  if (sessionPathAllowlist) {
    status.update(`sampled ${sessionPathAllowlist.length} transcripts for eval (1 long, 1 medium, 2 short)`);
  }
  status.update(`running dream cycle replay=${String(options.replayTranscripts === true)}`);
  await runDream(workspaceDir, {
    replayFromStart: options.replayTranscripts === true,
    persistState: options.replayTranscripts === true ? false : undefined,
    sessionPathAllowlist
  });
  status.update("loading runtime manifest and rubric");
  const runtime = readRuntimeManifest(workspaceDir);
  const rubric: DreamQualityRubricConfig = readDreamQualityRubric(workspaceDir, runtime);

  const promptTemplatePath = rubric.judgePromptTemplatePath;
  const promptTemplate = await readFile(promptTemplatePath, "utf8");
  const adapter = createAdapter(config);
  const allEvidenceFiles = [
    ...resolveJudgeEvidenceFiles(adapter),
    ...resolveMemoryOutputFiles(workspaceDir),
    ...resolveStagePromptFiles()
  ];
  // Filter transcript evidence to match the sampled sessions (session dir basename = sessionId)
  const allowedSessionIds = sessionPathAllowlist
    ? new Set(sessionPathAllowlist.map((p) => p.split("/").pop() ?? ""))
    : undefined;
  const evidenceFiles = allowedSessionIds
    ? allEvidenceFiles.filter((f) => {
        if (f.kind !== "transcript") return true;
        const fileBase = f.path.split("/").pop()?.replace(/\.jsonl$/, "") ?? "";
        return allowedSessionIds.has(fileBase);
      })
    : allEvidenceFiles;
  status.update(`evidence files=${evidenceFiles.length}`);
  const prompt = [
    promptTemplate.replaceAll("{{rubric}}", buildRubricText(rubric)),
    "",
    buildEvidenceToolingSection(evidenceFiles)
  ].join("\n");

  const evidenceDiagnostics = await Promise.all(
    evidenceFiles.map(async (file) => {
      try {
        const info = await stat(file.path);
        return { kind: file.kind, path: file.path, sizeBytes: info.size };
      } catch (error) {
        return { kind: file.kind, path: file.path, error: String(error) };
      }
    })
  );

  let rawJudgeOutput = "";
  let judgeToolUsed = false;
  let judgeToolError: string | undefined;
  status.update("running judge");
  const toolResult = await runToolContractJudge({
    providerOptions: config.copilotSdkProviderOptions,
    prompt,
    rubricDimensionIds: rubric.dimensions.map((dimension) => dimension.id),
    evidenceFiles
  });
  rawJudgeOutput = toolResult.toolPayload ? JSON.stringify(toolResult.toolPayload) : toolResult.rawOutput;
  judgeToolUsed = toolResult.toolUsed;
  judgeToolError = toolResult.toolError;

  const report = scoreReport(
    rawJudgeOutput,
    rubric,
    runtime.eval.quality.minPassingScore,
    config.copilotSdkModel,
    evidenceFiles.map((f) => f.path)
  );
  report.judgeMode = "tool-contract";
  report.judgeToolUsed = judgeToolUsed;
  report.judgeToolError = judgeToolError;
  const errorDetails = deriveJudgeErrorDiagnostics(judgeToolError);
  report.judgeDiagnostics = {
    requestTimeoutMs: config.copilotSdkProviderOptions.requestTimeoutMs,
    effectiveJudgeTimeoutMs: toolResult.judgeTimeoutMs,
    attempts: toolResult.attempts,
    elapsedMs: toolResult.elapsedMs,
    promptChars: prompt.length,
    promptEstimatedTokens: Math.ceil(prompt.length / 4),
    lastOutputChars: toolResult.lastOutputChars,
    failureCategory: errorDetails.failureCategory,
    rootCause: errorDetails.rootCause,
    modelCapabilitiesLimits: config.copilotSdkProviderOptions.sessionConfig.modelCapabilities?.limits
      ? {
          max_context_window_tokens: config.copilotSdkProviderOptions.sessionConfig.modelCapabilities.limits.max_context_window_tokens,
          max_prompt_tokens: config.copilotSdkProviderOptions.sessionConfig.modelCapabilities.limits.max_prompt_tokens
        }
      : undefined,
    evidence: evidenceDiagnostics
  };
  report.diagnostics = await buildDreamQualityDiagnostics(workspaceDir, config);
  const reportPath = join(workspaceStorageDir(workspaceDir), runtime.eval.quality.reportPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  status.done(`judge complete score=${report.weightedScore.toFixed(3)} passed=${String(report.passed)} report=${reportPath}`);

  return report;
}
