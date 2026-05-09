import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { readDreamConfig } from "../dream/config.js";
import {
  readDreamQualityRubric,
  readRuntimeManifest,
  resolveWorkspacePath,
  type DreamQualityRubricConfig
} from "../dream/runtime-manifest.js";
import { runDream } from "../dream/run-dream.js";
import {
  buildBundleText,
  buildRubricText,
  listMarkdownFiles,
  readArtifacts,
  scoreReport
} from "./dream-quality-helpers.js";
import { buildDreamQualityDiagnostics } from "./dream-quality-diagnostics.js";
import { runToolContractJudge } from "./dream-quality-tool-judge.js";
import { buildEvidenceToolingSection, resolveJudgeEvidenceFiles } from "./dream-quality-evidence.js";

export type DreamQualityReport = {
  generatedAt: string;
  model: string;
  minPassingScore: number;
  weightedScore: number;
  passed: boolean;
  dimensions: Array<{ id: string; score: number; weight: number; weighted: number; rationale: string }>;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  docsEvaluated: string[];
  rawJudgeOutput: string;
  judgeParseError?: string;
  judgeMode?: string;
  judgeToolUsed?: boolean;
  judgeToolError?: string;
  diagnostics?: unknown;
};

type RunQualityEvalOptions = {
  runDreamCycle: boolean;
  replayTranscripts?: boolean;
};

export async function runDreamQualityEval(
  workspaceDir: string,
  options: RunQualityEvalOptions
): Promise<DreamQualityReport> {
  if (options.runDreamCycle) {
    await runDream(workspaceDir, {
      replayFromStart: options.replayTranscripts === true,
      persistState: options.replayTranscripts === true ? false : undefined
    });
  }

  const runtime = readRuntimeManifest(workspaceDir);
  const config = readDreamConfig(workspaceDir);
  const rubric: DreamQualityRubricConfig = readDreamQualityRubric(workspaceDir, runtime);

  const docsRoot = resolveWorkspacePath(workspaceDir, config.docsOutputRootPath);
    const docPaths = await listMarkdownFiles(docsRoot);
    const docs = await Promise.all(
      docPaths.map(async (path) => ({
        path: relative(workspaceDir, path),
        content: (await readFile(path, "utf8")).slice(0, 12000)
      }))
    );

    const artifacts = await readArtifacts(workspaceDir);
    const promptTemplatePath = resolveWorkspacePath(workspaceDir, rubric.judgePromptTemplatePath);
    const promptTemplate = await readFile(promptTemplatePath, "utf8");
    const evidenceFiles = resolveJudgeEvidenceFiles(config);
    const prompt = [
      promptTemplate
      .replaceAll("{{rubric}}", buildRubricText(rubric))
      .replaceAll("{{generatedDocs}}", buildBundleText(docs))
      .replaceAll("{{artifacts}}", buildBundleText(artifacts)),
      "",
      buildEvidenceToolingSection(evidenceFiles)
    ].join("\n");

    let rawJudgeOutput = "";
    let judgeToolUsed = false;
    let judgeToolError: string | undefined;
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
      docs.map((doc) => doc.path)
    );
    report.judgeMode = "tool-contract";
    report.judgeToolUsed = judgeToolUsed;
    report.judgeToolError = judgeToolError;
    report.diagnostics = await buildDreamQualityDiagnostics(workspaceDir, config);

    const reportPath = resolveWorkspacePath(workspaceDir, runtime.eval.quality.reportPath);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

    return report;
}
