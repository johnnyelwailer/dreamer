import { runDreamQualityEval, type DreamQualityReport } from "../src/eval/dream-quality.js";

function printReport(report: DreamQualityReport): void {
  const pass = report.passed ? "✓ PASS" : "✗ FAIL";
  const bar = (score: number) => "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Dream Quality Eval  ${pass}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  Score : ${(report.weightedScore * 100).toFixed(1)}%  [${bar(report.weightedScore)}]  (min ${(report.minPassingScore * 100).toFixed(0)}%)`);
  console.log(`  Model : ${report.model}`);
  console.log(`  Docs  : ${report.docsEvaluated.join(", ") || "none"}`);
  if (report.judgeToolUsed !== undefined) {
    console.log(`  Judge : tool-contract  toolUsed=${report.judgeToolUsed}${report.judgeToolError ? `  error=${report.judgeToolError}` : ""}`);
  }
  if (report.judgeParseError) {
    console.log(`  Parse error: ${report.judgeParseError}`);
  }

  console.log(`\n─── Dimensions ───────────────────────`);
  for (const d of report.dimensions) {
    const pct = (d.score * 100).toFixed(0).padStart(3);
    console.log(`  ${d.id.padEnd(24)} ${pct}%  ${d.rationale}`);
  }

  if (report.strengths.length) {
    console.log(`\n─── Strengths ────────────────────────`);
    for (const s of report.strengths) console.log(`  + ${s}`);
  }

  if (report.weaknesses.length) {
    console.log(`\n─── Weaknesses ───────────────────────`);
    for (const w of report.weaknesses) console.log(`  - ${w}`);
  }

  if (report.improvements.length) {
    console.log(`\n─── Improvements ─────────────────────`);
    for (const i of report.improvements) console.log(`  → ${i}`);
  }

  console.log(`\n═══════════════════════════════════════\n`);
}

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const replayTranscripts = process.env.DREAM_EVAL_REPLAY_TRANSCRIPTS !== "0";
  const report = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: true,
    replayTranscripts
  });
  printReport(report);
  if (!report.passed) process.exitCode = 1;
}

await main();
