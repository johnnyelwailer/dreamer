import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runDreamQualityEval, type DreamQualityReport } from "../src/eval/dream-quality.js";

type QualityReport = {
  generatedAt: string;
  input: {
    docsEvaluated: string[];
    runConfig?: { adapterId?: string; backendId?: string; providerId?: string; model?: string };
    transcriptSummary?: {
      path?: string;
      sessionId?: string;
      lineCount?: number;
      messageCount?: number;
      toolCount?: number;
      userMessageCount?: number;
      assistantMessageCount?: number;
      substantiveMessageCount?: number;
      noisyMessageCount?: number;
      sampleUserMessages?: string[];
      sampleAssistantMessages?: string[];
    };
    derivedConclusions?: {
      memoryStatements?: string[];
      providerSummaryPreview?: string;
    };
  };
  judge: JudgeSummary;
};

type JudgeSummary = {
  score: number;
  passed: boolean;
  parseError?: string;
  toolUsed?: boolean;
  toolError?: string;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  dimensions: Array<{ id: string; score: number; rationale: string }>;
};

function buildJudgeSummary(report: DreamQualityReport): JudgeSummary {
  return {
    score: report.weightedScore,
    passed: report.passed,
    parseError: report.judgeParseError,
    toolUsed: report.judgeToolUsed,
    toolError: report.judgeToolError,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    improvements: report.improvements,
    dimensions: report.dimensions.map((dimension) => ({
      id: dimension.id,
      score: dimension.score,
      rationale: dimension.rationale
    }))
  };
}

function buildInputSummary(report: DreamQualityReport): QualityReport["input"] {
  const diagnostics = (report.diagnostics ?? {}) as {
    runConfig?: QualityReport["input"]["runConfig"];
    transcriptSummary?: QualityReport["input"]["transcriptSummary"];
    derivedConclusions?: QualityReport["input"]["derivedConclusions"];
  };

  return {
    docsEvaluated: report.docsEvaluated,
    runConfig: diagnostics.runConfig,
    transcriptSummary: diagnostics.transcriptSummary,
    derivedConclusions: diagnostics.derivedConclusions
  };
}

function buildJudgeMarkdown(summary: JudgeSummary): string[] {
  return [
    `- score=${summary.score}`,
    `- passed=${summary.passed}`,
    `- parseError=${Boolean(summary.parseError)}`,
    ...(summary.toolUsed \!== undefined ? [`- toolUsed=${summary.toolUsed}`, `- toolError=${summary.toolError ?? "none"}`] : []),
    "",
    "Dimensions:",
    ...summary.dimensions.map((dimension) =>
      `- ${dimension.id}: score=${dimension.score} rationale=${dimension.rationale}`
    ),
    "",
    "Strengths:",
    ...(summary.strengths.length ? summary.strengths.map((item) => `- ${item}`) : ["- none"]),
    "",
    "Weaknesses:",
    ...(summary.weaknesses.length ? summary.weaknesses.map((item) => `- ${item}`) : ["- none"]),
    "",
    "Improvements:",
    ...(summary.improvements.length ? summary.improvements.map((item) => `- ${item}`) : ["- none"]),
    ""
  ];
}

function markdown(report: QualityReport): string {
  const transcript = report.input.transcriptSummary;
  const conclusions = report.input.derivedConclusions;

  return [
    "# Dream Quality Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Evaluation Input",
    "",
    `- docs evaluated: ${report.input.docsEvaluated.join(", ") || "none"}`,
    `- adapter: ${report.input.runConfig?.adapterId ?? "unknown"}`,
    `- backend: ${report.input.runConfig?.backendId ?? "unknown"}`,
    `- provider: ${report.input.runConfig?.providerId ?? "unknown"}`,
    `- model: ${report.input.runConfig?.model ?? "unknown"}`,
    ...(transcript
      ? [
          `- transcript session: ${transcript.sessionId ?? "unknown"}`,
          `- transcript path: ${transcript.path ?? "unknown"}`,
          `- transcript lines: ${transcript.lineCount ?? 0}`,
          `- transcript messages: ${transcript.messageCount ?? 0}`,
          `- transcript tools: ${transcript.toolCount ?? 0}`,
          `- user messages: ${transcript.userMessageCount ?? 0}`,
          `- assistant messages: ${transcript.assistantMessageCount ?? 0}`,
          `- substantive messages: ${transcript.substantiveMessageCount ?? 0}`,
          `- noisy messages: ${transcript.noisyMessageCount ?? 0}`
        ]
      : ["- transcript summary: unavailable"]),
    "",
    "Sample user messages:",
    ...(transcript?.sampleUserMessages?.length
      ? transcript.sampleUserMessages.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Sample assistant messages:",
    ...(transcript?.sampleAssistantMessages?.length
      ? transcript.sampleAssistantMessages.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Dreamer Conclusions From Transcript",
    "",
    ...(conclusions?.memoryStatements?.length
      ? conclusions.memoryStatements.map((item) => `- ${item}`)
      : ["- none recorded"]),
    ...(conclusions?.providerSummaryPreview ? ["", "Provider summary preview:", "", conclusions.providerSummaryPreview, ""] : [""]),
    "## Judge Outcome",
    "",
    ...buildJudgeMarkdown(report.judge)
  ].join("\n");
}

function conciseMarkdown(report: QualityReport): string {
  const transcript = report.input.transcriptSummary;
  const conclusions = report.input.derivedConclusions;

  const isNoisySample = (value: string): boolean =>
    value.startsWith("[") || /notification:|waiting for input|command completed/i.test(value);
  const filteredUserSamples = (transcript?.sampleUserMessages ?? []).filter((item) => \!isNoisySample(item));
  const filteredAssistantSamples = (transcript?.sampleAssistantMessages ?? []).filter((item) => \!isNoisySample(item));

  const thoughts = (conclusions?.memoryStatements ?? [])
    .filter((item) => \!/^Observed (docs_count|session_starts|message_events|tool_events)=/.test(item))
    .slice(0, 8);
  const outputs = report.input.docsEvaluated;
  const blockers = [report.judge.parseError, report.judge.toolError]
    .filter((value): value is string => Boolean(value));

  return [
    "# Dream Judge Human Report",
    "",
    "## Conversation",
    "",
    `- session: ${transcript?.sessionId ?? "unknown"}`,
    `- transcript: ${transcript?.path ?? "unknown"}`,
    `- scale: messages=${transcript?.messageCount ?? 0}, user=${transcript?.userMessageCount ?? 0}, assistant=${transcript?.assistantMessageCount ?? 0}, tools=${transcript?.toolCount ?? 0}`,
    "",
    "User messages (sample):",
    ...(filteredUserSamples.length
      ? filteredUserSamples.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "Assistant behavior (sample):",
    ...(filteredAssistantSamples.length
      ? filteredAssistantSamples.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Dreamer Thoughts",
    "",
    ...(thoughts.length ? thoughts.map((item) => `- ${item}`) : ["- none recorded"]),
    ...(conclusions?.providerSummaryPreview
      ? ["", "Provider summary:", `- ${conclusions.providerSummaryPreview}`]
      : []),
    "",
    "## Dreamer Outputs",
    "",
    ...(outputs.length ? outputs.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Outcome",
    "",
    `- score=${report.judge.score}, passed=${report.judge.passed}, toolUsed=${Boolean(report.judge.toolUsed)}`,
    "",
    "Current blockers:",
    ...(blockers.length ? blockers.map((item) => `- ${item}`) : ["- none"]),
    ""
  ].join("\n");
}

async function main(): Promise<void> {
  const workspaceDir = process.env.DREAMER_WORKSPACE_DIR ?? process.cwd();

  const result = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: true,
    replayTranscripts: true
  });

  const report: QualityReport = {
    generatedAt: new Date().toISOString(),
    input: buildInputSummary(result),
    judge: buildJudgeSummary(result)
  };

  const jsonPath = join(workspaceDir, "reports", "evals", "dream-quality-report.json");
  const mdPath = join(workspaceDir, "reports", "evals", "dream-quality-report.md");
  const humanPath = join(workspaceDir, "reports", "evals", "dream-judge-human.md");
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, markdown(report), "utf8");
  await writeFile(humanPath, conciseMarkdown(report), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

await main();
