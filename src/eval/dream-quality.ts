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

type RunQualityEvalOptions = { replayTranscripts?: boolean };
export async function runDreamQualityEval(
  workspaceDir: string,
  options: RunQualityEvalOptions = {}
): Promise<DreamQualityReport> {
  const status = createTtyStatus("[eval:dream-quality]");
  status.update(`start workspace=${workspaceDir}`);
  status.update(`running dream cycle replay=${String(options.replayTranscripts === true)}`);
  await runDream(workspaceDir, {
    replayFromStart: options.replayTranscripts === true,
    persistState: options.replayTranscripts === true ? false : undefined
  });
  status.update("loading runtime manifest and rubric");
  const runtime = readRuntimeManifest(workspaceDir);
  const config = readDreamConfig(workspaceDir);
  const rubric: DreamQualityRubricConfig = readDreamQualityRubric(workspaceDir, runtime);

  const promptTemplatePath = rubric.judgePromptTemplatePath;
  const promptTemplate = await readFile(promptTemplatePath, "utf8");
  const adapter = createAdapter(config);
  const evidenceFiles = [
    ...resolveJudgeEvidenceFiles(adapter),
    ...resolveMemoryOutputFiles(workspaceDir),
    ...resolveStagePromptFiles()
  ];
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
