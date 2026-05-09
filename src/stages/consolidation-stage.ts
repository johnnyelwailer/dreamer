import type { PipelineStage } from "../core/contracts.js";
import type { DreamContext, MemoryRecord } from "../core/types.js";

function makeId(value: string): string {
  return `mem:${Buffer.from(value).toString("base64url").slice(0, 20)}`;
}

function toInsightStatement(signal: string): string | undefined {
  if (!signal.startsWith("insight:")) return undefined;
  const statement = signal.slice("insight:".length).trim();
  if (!statement) return undefined;
  if (/^[a-z_]+\s*=\s*\d+$/i.test(statement)) return undefined;
  return statement;
}

export class ConsolidationStage implements PipelineStage {
  readonly id = "stage.consolidation";

  async run(context: DreamContext): Promise<DreamContext> {
    const priorCount = context.memories.length;
    context.memories = context.memories.filter((memory) => !memory.statement.startsWith("Observed "));
    const removedNoise = priorCount - context.memories.length;

    const byStatement = new Map(context.memories.map((m) => [m.statement, m]));
    for (const signal of context.signals) {
      const statement = toInsightStatement(signal);
      if (!statement) continue;
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
        confidence: 0.85,
        provenance: {
          source: "dream-run-intelligence",
          eventIds: context.events.map((e) => e.id),
          capturedAt: context.nowIso
        }
      };
      context.memories.push(record);
      context.metrics.memoriesAdded += 1;
      byStatement.set(statement, record);
    }

    if (removedNoise > 0) {
      context.diary.push(`consolidation:removed-noise-memories=${removedNoise}`);
    }
    return context;
  }
}
