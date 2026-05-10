import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export class OrientationStage implements PipelineStage {
  readonly id = "stage.orientation";

  async run(context: DreamContext): Promise<DreamContext> {
    const runDir = join(workspaceStorageDir(context.workspaceDir), "runs", context.runId);
    await mkdir(runDir, { recursive: true });

    let agentsMd = "";
    try {
      agentsMd = await readFile(join(context.workspaceDir, "AGENTS.md"), "utf8");
    } catch { /* no AGENTS.md */ }

    const sessions = context.events.filter((e) => e.kind === "session_start").length;
    const projectName = context.workspaceDir.split("/").pop() ?? "unknown";
    const lines = [
      `# Workspace: ${projectName}`,
      `Existing memories: ${context.memories.length}`,
      `Sessions to analyze: ${sessions}`,
      `Run ID: ${context.runId}`,
      "",
      agentsMd ? `## AGENTS.md\n\n${agentsMd}` : "## AGENTS.md\n\n(not present)"
    ];

    await writeFile(join(runDir, "orientation.md"), lines.join("\n"), "utf8");
    context.diary.push(`orientation:agents_md=${agentsMd.length > 0}`);
    context.diary.push(`orientation:run_dir=${runDir}`);
    return context;
  }
}
