import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";

export class OrientationStage implements PipelineStage {
  readonly id = "stage.orientation";

  async run(context: DreamContext): Promise<DreamContext> {
    const docsDir = join(context.workspaceDir, "docs");
    let docsCount = 0;
    try {
      const entries = await readdir(docsDir);
      docsCount = entries.length;
    } catch {
      docsCount = 0;
    }
    context.signals.push(`docs_count=${docsCount}`);
    context.diary.push(`orientation:docs=${docsCount}`);
    return context;
  }
}
