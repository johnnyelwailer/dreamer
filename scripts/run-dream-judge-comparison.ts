import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runDreamQualityEval, type DreamQualityReport } from "../src/eval/dream-quality.js";

type ComparisonReport = {
  generatedAt: string;
  comparisonSignal: "low" | "usable";
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
  legacy: JudgeSummary;
  toolContract: JudgeSummary;
  deltaScore: number;
  preferred: "legacy-json" | "tool-contract" | "tie";
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

function decidePreferred(report: ComparisonReport): ComparisonReport["preferred"] {
  if (report.toolContract.score > report.legacy.score) return "tool-contract";
  if (report.legacy.score > report.toolContract.score) return "legacy-json";
  return "tie";
}

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

function buildInputSummary(report: DreamQualityReport): ComparisonReport["input"] {
  const diagnostics = (report.diagnostics ?? {}) as {
    runConfig?: ComparisonReport["input"]["runConfig"];
    transcriptSummary?: ComparisonReport["input"]["transcriptSummary"];
    derivedConclusions?: ComparisonReport["input"]["derivedConclusions"];
  };

  return {
    docsEvaluated: report.docsEvaluated,
    runConfig: diagnostics.runConfig,
    transcriptSummary: diagnostics.transcriptSummary,
    derivedConclusions: diagnostics.derivedConclusions
  };
}

function buildJudgeMarkdown(label: string, summary: JudgeSummary): string[] {
  return [
    `### ${label}`,
    "",
    `- score=${summary.score}`,
    `- passed=${summary.passed}`,
    `- parseError=${Boolean(summary.parseError)}`,
    ...(summary.toolUsed !== undefined ? [`- toolUsed=${summary.toolUsed}`, `- toolError=${summary.toolError ?? "none"}`] : []),
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

function markdown(report: ComparisonReport): string {
  const transcript = report.input.transcriptSummary;
  const conclusions = report.input.derivedConclusions;

  return [
    "# Dream Judge Approach Comparison",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Comparison Signal",
    "",
    report.comparisonSignal === "low"
      ? "Both absolute scores are very low, so this comparison is low-signal. Treat it as provenance/debug output, not as meaningful judge selection evidence yet."
      : "Absolute scores are high enough to make the comparison more informative.",
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
    "## Scores",
    "",
    `- legacy-json: score=${report.legacy.score}, passed=${report.legacy.passed}, parseError=${Boolean(report.legacy.parseError)}`,
    `- tool-contract: score=${report.toolContract.score}, passed=${report.toolContract.passed}, parseError=${Boolean(report.toolContract.parseError)}, toolUsed=${Boolean(report.toolContract.toolUsed)}, toolError=${report.toolContract.toolError ?? "none"}`,
    "",
    `Delta (tool - legacy): ${report.deltaScore.toFixed(4)}`,
    `Preferred: ${report.preferred}`,
    "",
    "## Judge Conclusions",
    "",
    ...buildJudgeMarkdown("legacy-json", report.legacy),
    ...buildJudgeMarkdown("tool-contract", report.toolContract)
  ].join("\n");
}

function conciseMarkdown(report: ComparisonReport): string {
  const transcript = report.input.transcriptSummary;
  const conclusions = report.input.derivedConclusions;

  const isNoisySample = (value: string): boolean =>
    value.startsWith("[") || /notification:|waiting for input|command completed/i.test(value);
  const filteredUserSamples = (transcript?.sampleUserMessages ?? []).filter((item) => !isNoisySample(item));
  const filteredAssistantSamples = (transcript?.sampleAssistantMessages ?? []).filter((item) => !isNoisySample(item));

  const thoughts = (conclusions?.memoryStatements ?? [])
    .filter((item) => !/^Observed (docs_count|session_starts|message_events|tool_events)=/.test(item))
    .slice(0, 8);
  const outputs = report.input.docsEvaluated;
  const blockers = [report.legacy.parseError, report.toolContract.parseError, report.toolContract.toolError]
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
    `- preferred judge: ${report.preferred}`,
    `- comparison signal: ${report.comparisonSignal}`,
    `- legacy-json: score=${report.legacy.score}, passed=${report.legacy.passed}`,
    `- tool-contract: score=${report.toolContract.score}, passed=${report.toolContract.passed}, toolUsed=${Boolean(report.toolContract.toolUsed)}`,
    "",
    "Current blockers:",
    ...(blockers.length ? blockers.map((item) => `- ${item}`) : ["- none"]),
    ""
  ].join("\n");
}

async function main(): Promise<void> {
  const workspaceDir = process.cwd();

  const legacy = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: true,
    replayTranscripts: true,
    judgeMode: "legacy-json"
  });
  const toolContract = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: false,
    replayTranscripts: true,
    judgeMode: "tool-contract"
  });

  const report: ComparisonReport = {
    generatedAt: new Date().toISOString(),
    comparisonSignal: Math.max(legacy.weightedScore, toolContract.weightedScore) < 0.2 ? "low" : "usable",
    input: buildInputSummary(legacy),
    legacy: buildJudgeSummary(legacy),
    toolContract: buildJudgeSummary(toolContract),
    deltaScore: toolContract.weightedScore - legacy.weightedScore,
    preferred: "tie"
  };

  report.preferred = decidePreferred(report);

  const jsonPath = join(workspaceDir, "reports", "evals", "dream-judge-comparison.json");
  const mdPath = join(workspaceDir, "reports", "evals", "dream-judge-comparison.md");
  const humanPath = join(workspaceDir, "reports", "evals", "dream-judge-human.md");
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, markdown(report), "utf8");
  await writeFile(humanPath, conciseMarkdown(report), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

await main();
