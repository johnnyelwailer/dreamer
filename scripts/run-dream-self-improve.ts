import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runDreamQualityEval } from "../src/eval/dream-quality.js";
import { readRuntimeManifest, resolveWorkspacePath } from "../src/dream/runtime-manifest.js";

function normalizeHint(value: string): string {
  return value.trim().replace(/^-\s*/, "");
}

function toBulletedList(values: string[]): string {
  if (!values.length) return "";
  return values.map((value) => `- ${value}`).join("\n") + "\n";
}

async function applyImprovements(workspaceDir: string, improvements: string[]): Promise<string[]> {
  const runtime = readRuntimeManifest(workspaceDir);
  const hintsPath = resolveWorkspacePath(workspaceDir, runtime.docs.improvementHintsPath);
  const current = await readFile(hintsPath, "utf8").catch(() => "");
  const existing = current
    .split("\n")
    .map((line) => normalizeHint(line))
    .filter(Boolean);

  const next = [...existing];
  for (const improvement of improvements) {
    const normalized = normalizeHint(improvement);
    if (!normalized) continue;
    if (!next.includes(normalized)) next.push(normalized);
  }

  const capped = next.slice(-runtime.eval.quality.maxHintsToPersist);
  await mkdir(dirname(hintsPath), { recursive: true });
  await writeFile(hintsPath, toBulletedList(capped), "utf8");
  return capped;
}

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const runtime = readRuntimeManifest(workspaceDir);

  const before = await runDreamQualityEval(workspaceDir, { runDreamCycle: true });
  let persistedHints: string[] = [];
  let after = before;

  if (!before.passed && before.improvements.length > 0) {
    persistedHints = await applyImprovements(workspaceDir, before.improvements);
    after = await runDreamQualityEval(workspaceDir, { runDreamCycle: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    before: {
      weightedScore: before.weightedScore,
      passed: before.passed
    },
    after: {
      weightedScore: after.weightedScore,
      passed: after.passed
    },
    improved: after.weightedScore > before.weightedScore,
    persistedHints,
    beforeReportPath: runtime.eval.quality.reportPath
  };

  const outPath = resolveWorkspacePath(workspaceDir, runtime.eval.quality.selfImproveReportPath);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  if (!after.passed) process.exitCode = 1;
}

await main();
