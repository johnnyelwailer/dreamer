import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readDreamConfig } from "../dream/config.js";
import {
  readRuntimeManifest,
  type DreamQualityRubricConfig
} from "../dream/runtime-manifest.js";
import { readFileSync } from "node:fs";
import {
  buildRubricText,
  scoreReport
} from "./dream-quality-helpers.js";
import { readMemoryArtifacts } from "./dream-quality-memory-artifacts.js";
import { runToolContractJudge } from "./dream-quality-tool-judge.js";
import { buildEvidenceToolingSection, resolveJudgeEvidenceFiles, type JudgeEvidenceFile } from "./dream-quality-evidence.js";
import type { DreamQualityReport } from "./dream-quality.js";
import { parseDreamQualityRubricObject } from "../dream/runtime-manifest-content-parse.js";
import { resolveAssetPath, workspaceStorageDir } from "../dream/dreamer-home.js";

function readConversationRubric(): DreamQualityRubricConfig {
  const path = resolveAssetPath("evals/conversation-quality-rubric.json");
  return parseDreamQualityRubricObject(JSON.parse(readFileSync(path, "utf8")) as unknown, "conversation-quality-rubric");
}

export async function runConversationQualityEval(workspaceDir: string): Promise<DreamQualityReport> {
  const runtime = readRuntimeManifest(workspaceDir);
  const config = readDreamConfig(workspaceDir);
  const rubric = readConversationRubric();

  const transcriptFiles = resolveJudgeEvidenceFiles(config);
  const memoryArtifacts = await readMemoryArtifacts(workspaceDir);

  const memoryEvidenceFiles: JudgeEvidenceFile[] = memoryArtifacts.map((a) => ({
    path: a.path,
    kind: "artifact" as const
  }));

  const allEvidenceFiles: JudgeEvidenceFile[] = [...transcriptFiles, ...memoryEvidenceFiles];

  const promptTemplatePath = rubric.judgePromptTemplatePath;
  const promptTemplate = await readFile(promptTemplatePath, "utf8");

  const prompt = [
    promptTemplate.replaceAll("{{rubric}}", buildRubricText(rubric)),
    "",
    buildEvidenceToolingSection(allEvidenceFiles)
  ].join("\n");

  const toolResult = await runToolContractJudge({
    providerOptions: config.copilotSdkProviderOptions,
    prompt,
    rubricDimensionIds: rubric.dimensions.map((d) => d.id),
    evidenceFiles: allEvidenceFiles
  });

  const rawJudgeOutput = toolResult.toolPayload
    ? JSON.stringify(toolResult.toolPayload)
    : toolResult.rawOutput;

  const report = scoreReport(
    rawJudgeOutput,
    rubric,
    runtime.eval.quality.minPassingScore,
    config.copilotSdkModel,
    []
  );
  report.judgeMode = "tool-contract";
  report.judgeToolUsed = toolResult.toolUsed;
  report.judgeToolError = toolResult.toolError;

  const reportPath = join(workspaceStorageDir(workspaceDir), "reports", "evals", "conversation-quality-eval.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  return report;
}
