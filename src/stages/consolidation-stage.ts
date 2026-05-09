import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext, MemoryRecord } from "../core/types.js";

function makeId(value: string): string {
  return `mem:${Buffer.from(value).toString("base64url").slice(0, 20)}`;
}

export class ConsolidationStage implements PipelineStage {
  readonly id = "stage.consolidation";

  async run(context: DreamContext): Promise<DreamContext> {
    const byStatement = new Map(context.memories.map((m) => [m.statement, m]));
    for (const signal of context.signals) {
      const statement = `Observed ${signal}`;
      const existing = byStatement.get(statement);
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.05);
        context.metrics.memoriesUpdated += 1;
        continue;
      }
      const record: MemoryRecord = {
        id: makeId(statement),
        scope: "workspace",
        statement,
        confidence: 0.7,
        provenance: {
          source: "dream-run",
          eventIds: context.events.map((e) => e.id),
          capturedAt: context.nowIso
        }
      };
      if (statement.includes("provider") && context.memories.some((m) => m.statement.includes("provider"))) {
        record.contradictoryTo = context.memories.find((m) => m.statement.includes("provider"))?.id;
        context.metrics.contradictionsFound += 1;
      }
      context.memories.push(record);
      context.metrics.memoriesAdded += 1;
      byStatement.set(statement, record);
    }
    return context;
  }
}
