import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { readDreamConfig } from "../dream/config.js";
import {
  readDreamQualityRubric,
  readRuntimeManifest,
  resolveWorkspacePath,
  type DreamQualityRubricConfig
} from "../dream/runtime-manifest.js";
import { CopilotSdkProvider } from "../providers/copilot-sdk-provider.js";
import { runDream } from "../dream/run-dream.js";
import {
  buildBundleText,
  buildRubricText,
  listMarkdownFiles,
  readArtifacts,
  scoreReport
} from "./dream-quality-helpers.js";
import { buildDreamQualityDiagnostics } from "./dream-quality-diagnostics.js";

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
  const provider = new CopilotSdkProvider(config.copilotSdkProviderOptions);

  try {
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
    const prompt = promptTemplate
      .replaceAll("{{rubric}}", buildRubricText(rubric))
      .replaceAll("{{generatedDocs}}", buildBundleText(docs))
      .replaceAll("{{artifacts}}", buildBundleText(artifacts));

    const rawJudgeOutput = await provider.summarize(prompt);
    const report = scoreReport(
      rawJudgeOutput,
      rubric,
      runtime.eval.quality.minPassingScore,
      config.copilotSdkModel,
      docs.map((doc) => doc.path)
    );
    report.diagnostics = await buildDreamQualityDiagnostics(workspaceDir, config);

    const reportPath = resolveWorkspacePath(workspaceDir, runtime.eval.quality.reportPath);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

    return report;
  } finally {
    await provider.dispose();
  }
}
