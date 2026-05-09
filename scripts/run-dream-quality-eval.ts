import { runDreamQualityEval } from "../src/eval/dream-quality.js";

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const replayTranscripts = process.env.DREAM_EVAL_REPLAY_TRANSCRIPTS !== "0";
  const report = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: true,
    replayTranscripts
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
