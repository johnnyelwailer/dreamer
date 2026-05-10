import { defineTool } from "@github/copilot-sdk";
import type { MemoryRecord } from "../core/types.js";
import { createWriteMemoryTool } from "./consolidation-write-memory-tool.js";

export function createConsolidationTools(memories: MemoryRecord[], nowIso: string) {
  const added: MemoryRecord[] = [];
  let updated = 0;
  const removedIds = new Set<string>();

  const listMemoriesTool = defineTool("list_memories", {
    description: "List all current memories with their ids, statements, scopes, and confidence scores.",
    parameters: { type: "object", properties: {} },
    skipPermission: true,
    handler: () => {
      const active = memories.filter((m) => !removedIds.has(m.id));
      return {
        textResultForLlm: JSON.stringify(active.map((m) => ({
          id: m.id,
          scope: m.scope,
          statement: m.statement,
          confidence: m.confidence,
          category: m.context?.category,
          tags: m.context?.tags,
          horizon: m.capture?.horizon,
          expiresAt: m.capture?.expiresAt,
          reason: m.capture?.reason,
          references: m.capture?.references
        }))),
        resultType: "success" as const
      };
    }
  });

  const writeMemoryTool = createWriteMemoryTool({
    memories,
    nowIso,
    onAdded: (record) => added.push(record),
    onUpdated: () => {
      updated++;
    }
  });

  const removeMemoryTool = defineTool("remove_memory", {
    description: "Remove a stale or contradicted memory by id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    },
    skipPermission: true,
    handler: (args) => {
      const id = String(args.id ?? "");
      const exists = memories.some((m) => m.id === id);
      if (!exists) return { textResultForLlm: "Memory not found.", resultType: "error" as const };
      removedIds.add(id);
      return { textResultForLlm: "Memory removed.", resultType: "success" as const };
    }
  });

  function applyChanges(ctx: { memories: MemoryRecord[]; metrics: { memoriesAdded: number; memoriesUpdated: number; contradictionsFound: number } }): void {
    ctx.memories = memories.filter((m) => !removedIds.has(m.id));
    ctx.metrics.memoriesAdded += added.length;
    ctx.metrics.memoriesUpdated += updated;
    ctx.metrics.contradictionsFound += removedIds.size;
  }

  return { tools: [listMemoriesTool, writeMemoryTool, removeMemoryTool], applyChanges };
}
