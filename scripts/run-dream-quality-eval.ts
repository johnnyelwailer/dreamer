import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runDreamQualityEval } from "../src/eval/dream-quality.js";
import type { DreamQualityReport } from "../src/eval/dream-quality-types.js";
import { ttyWriteLine, ttyWriteTagged } from "../src/shared/tty-log-format.js";

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
  const dims = report.dimensions.map(d => `${d.id}=${(d.score * 100).toFixed(0)}%`).join("  ");
  const elapsedS = report.judgeDiagnostics ? `${(report.judgeDiagnostics.elapsedMs / 1000).toFixed(0)}s` : "";
  const attempts = report.judgeDiagnostics ? `attempt ${report.judgeDiagnostics.attempts}` : "";

  ttyWriteLine(`\n  ${pass}  ${(report.weightedScore * 100).toFixed(1)}% (min ${(report.minPassingScore * 100).toFixed(0)}%)  ·  ${report.transcriptsEvaluated.length} transcripts  ·  ${attempts}  ·  ${elapsedS}`);
  ttyWriteLine(`  ${dims}`);

  if (report.weaknesses.length) {
    for (const w of report.weaknesses) ttyWriteLine(`  - ${w}`);
  }
  if (report.improvements.length) {
    for (const i of report.improvements) ttyWriteLine(`  → ${i}`);
  }
  if (report.judgeToolError) ttyWriteLine(`  error: ${report.judgeToolError}`);
  if (report.judgeParseError) ttyWriteLine(`  parse error: ${report.judgeParseError}`);
  if (report.judgeDiagnostics?.rootCause) ttyWriteLine(`  root cause: ${report.judgeDiagnostics.rootCause}`);
  ttyWriteLine();
}

async function main(): Promise<void> {
  const workspaceDir = process.env.DREAMER_WORKSPACE_DIR ?? process.cwd();
  const replayTranscripts = process.env.DREAM_EVAL_REPLAY_TRANSCRIPTS !== "0";
  if (["1", "true", "yes", "on"].includes((process.env.DREAM_EVAL_LIVE_STREAM ?? "").trim().toLowerCase())) {
    ttyWriteTagged("judge", "live token output enabled", { stream: process.stdout });
    process.stdout.write("\n");
  }
  const report = await runDreamQualityEval(workspaceDir, { replayTranscripts });
  printReport(report);
}

await main();
