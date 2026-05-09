import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runDreamQualityEval, type DreamQualityReport } from "../src/eval/dream-quality.js";

// Auto-load .env.local
try {
  const envLocal = await readFile(join(import.meta.dirname, "..", ".env.local"), "utf8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env.local */ }

function printReport(report: DreamQualityReport): void {
  const pass = report.passed ? "✓ PASS" : "✗ FAIL";
  const bar = (score: number) => "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Dream Quality Eval  ${pass}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  Score : ${(report.weightedScore * 100).toFixed(1)}%  [${bar(report.weightedScore)}]  (min ${(report.minPassingScore * 100).toFixed(0)}%)`);
  console.log(`  Model : ${report.model}`);
  console.log(`  Transcripts : ${report.transcriptsEvaluated.join("\n              ") || "none"}`);
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
  const workspaceDir = process.env.DREAMER_WORKSPACE_DIR ?? process.cwd();
  const replayTranscripts = process.env.DREAM_EVAL_REPLAY_TRANSCRIPTS !== "0";
  const report = await runDreamQualityEval(workspaceDir, { replayTranscripts });
  printReport(report);
  if (!report.passed) process.exitCode = 1;
}

await main();
