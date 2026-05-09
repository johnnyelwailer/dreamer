import { runDreamQualityEval } from "../src/eval/dream-quality.js";

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const report = await runDreamQualityEval(workspaceDir, { runDreamCycle: true });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
