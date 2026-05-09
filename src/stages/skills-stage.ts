import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import { assertSafeWritePath } from "../core/safety.js";
import type { DreamContext } from "../core/types.js";

export class SkillsStage implements PipelineStage {
  readonly id = "stage.skills";

  async run(context: DreamContext): Promise<DreamContext> {
    const proposals = context.signals
      .filter((s) => s.includes("docs_count") || s.includes("session_starts"))
      .map((s) => `- proposal: refine workflow for ${s}`);
    const outDir = join(context.workspaceDir, "reports");
    await mkdir(outDir, { recursive: true });
    const path = assertSafeWritePath(context.workspaceDir, join(outDir, "skill-patches.md"));
    await writeFile(path, `# Skill Patch Proposals\n\n${proposals.join("\n")}\n`, "utf8");
    context.metrics.skillPatchesProposed += proposals.length;
    return context;
  }
}
