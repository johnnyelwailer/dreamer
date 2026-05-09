import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";

export class DocumentationStage implements PipelineStage {
  readonly id = "stage.documentation";

  async run(context: DreamContext): Promise<DreamContext> {
    context.diary.push("documentation:deferred_to_provider");
    return context;
  }
}
