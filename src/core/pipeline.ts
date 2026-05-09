import type { PipelineStage } from "./contracts.js";
import type { DreamContext } from "./types.js";

export async function runPipeline(
  initial: DreamContext,
  stages: PipelineStage[]
): Promise<DreamContext> {
  let context = initial;
  for (const stage of stages) {
    context.diary.push(`stage:${stage.id}:start`);
    context = await stage.run(context);
    context.diary.push(`stage:${stage.id}:end`);
  }
  return context;
}
