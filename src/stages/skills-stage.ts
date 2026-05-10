import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export class SkillsStage implements PipelineStage {
  readonly id = "stage.skills";

  async run(context: DreamContext): Promise<DreamContext> {
    const outDir = join(workspaceStorageDir(context.workspaceDir), "reports");
    await mkdir(outDir, { recursive: true });
    // Placeholder: skill detection to be driven by AI agent in a future slice.
    await writeFile(join(outDir, "skill-patches.md"), "# Skill Patch Proposals\n\n(none this run)\n", "utf8");
    return context;
  }
}

