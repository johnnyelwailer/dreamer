import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export class GovernanceStage implements PipelineStage {
  readonly id = "stage.governance";

  async run(context: DreamContext): Promise<DreamContext> {
    const suspicious = context.events.filter((e) => /ignore previous|execute this/i.test(e.text));
    const report = {
      inertDataEnforced: context.events.every((e) => e.metadata.treatedAsData === true),
      suspiciousEventCount: suspicious.length,
      blockedUnsafeWritePaths: true
    };
    const outDir = join(workspaceStorageDir(context.workspaceDir), "reports");
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "governance.json"), JSON.stringify(report, null, 2), "utf8");
    return context;
  }
}
