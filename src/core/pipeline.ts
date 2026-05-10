import type { PipelineStage } from "./contracts.js";
import type { DreamContext } from "./types.js";
import { type TtyStatus } from "../shared/tty-progress.js";

export async function runPipeline(
  initial: DreamContext,
  stages: PipelineStage[],
  status?: TtyStatus
): Promise<DreamContext> {
  let context = initial;
  for (const stage of stages) {
    context.diary.push(`stage:${stage.id}:start`);
    context = status
      ? await status.track(`stage ${stage.id}`, stage.run(context), { intervalMs: 10000 })
      : await stage.run(context);
    context.diary.push(`stage:${stage.id}:end`);
  }
  return context;
}
