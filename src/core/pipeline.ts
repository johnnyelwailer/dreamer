import type { PipelineStage } from "./contracts.js";
import type { DreamContext } from "./types.js";
import { type TtyStatus } from "../shared/tty-progress.js";
import chalk from "chalk";
import { ttyWriteLine } from "../shared/tty-log-format.js";

const PHASE_BAR = "=".repeat(72);

function writePhaseBanner(stageId: string, state: "start" | "done" | "failed", stream: NodeJS.WriteStream = process.stderr): void {
  const label = state === "start" ? "PHASE START" : state === "done" ? "PHASE DONE" : "PHASE FAILED";
  const color = state === "start" ? chalk.cyanBright : state === "done" ? chalk.greenBright : chalk.redBright;
  ttyWriteLine("", { stream });
  ttyWriteLine(color(PHASE_BAR), { stream });
  ttyWriteLine(color(`${label} :: ${stageId}`), { stream });
  ttyWriteLine(color(PHASE_BAR), { stream });
}

export async function runPipeline(
  initial: DreamContext,
  stages: PipelineStage[],
  status?: TtyStatus
): Promise<DreamContext> {
  let context = initial;
  for (const stage of stages) {
    context.diary.push(`stage:${stage.id}:start`);
    writePhaseBanner(stage.id, "start");
    try {
      context = status
        ? await status.track(`stage ${stage.id}`, stage.run(context), { intervalMs: 10000 })
        : await stage.run(context);
      writePhaseBanner(stage.id, "done");
    } catch (error) {
      writePhaseBanner(stage.id, "failed");
      throw error;
    }
    context.diary.push(`stage:${stage.id}:end`);
  }
  return context;
}
