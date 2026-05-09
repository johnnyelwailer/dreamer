import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext } from "../core/types.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export class ObservabilityStage implements PipelineStage {
  readonly id = "stage.observability";

  async run(context: DreamContext): Promise<DreamContext> {
    const outDir = join(workspaceStorageDir(context.workspaceDir), "reports");
    await mkdir(outDir, { recursive: true });
    const summary = [
      `Dream completed for repo: ${context.workspaceDir.split("/").pop() ?? "unknown"}`,
      `- sessions processed: ${context.metrics.sessionsProcessed}`,
      `- memories added: ${context.metrics.memoriesAdded}`,
      `- memories updated: ${context.metrics.memoriesUpdated}`,
      `- contradictions detected: ${context.metrics.contradictionsFound}`,
      `- docs generated: ${context.metrics.docsGenerated}`,
      `- skill patches proposed: ${context.metrics.skillPatchesProposed}`
    ].join("\n");
    await writeFile(join(outDir, "dream-diary.md"), `${summary}\n`, "utf8");
    await writeFile(join(outDir, "metrics.json"), JSON.stringify(context.metrics, null, 2), "utf8");
    const pipelineLog = {
      runId: context.runId,
      generatedAt: context.nowIso,
      diary: context.diary,
      metrics: context.metrics,
      providerOutputs: context.providerOutputs,
      eventsSample: context.events.slice(0, 10),
      memoriesSample: context.memories.slice(0, 10)
    };
    await writeFile(join(outDir, "pipeline-log.json"), JSON.stringify(pipelineLog, null, 2), "utf8");
    return context;
  }
}
