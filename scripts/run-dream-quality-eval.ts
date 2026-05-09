import { runDreamQualityEval } from "../src/eval/dream-quality.js";

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const replayTranscripts = process.env.DREAM_EVAL_REPLAY_TRANSCRIPTS !== "0";
  const judgeMode = process.env.DREAM_EVAL_JUDGE_MODE === "tool-contract" ? "tool-contract" : "legacy-json";
  const report = await runDreamQualityEval(workspaceDir, {
    runDreamCycle: true,
    replayTranscripts,
    judgeMode
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

await main();
