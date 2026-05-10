import { defineTool } from "@github/copilot-sdk";
import type { MemoryRecord } from "../core/types.js";

export function createConsolidationTools(memories: MemoryRecord[], nowIso: string) {
  const added: MemoryRecord[] = [];
  const removedIds = new Set<string>();

  function makeId(value: string): string {
    return `mem:${Buffer.from(value).toString("base64url").slice(0, 20)}`;
  }

  const listMemoriesTool = defineTool("list_memories", {
    description: "List all current memories with their ids, statements, scopes, and confidence scores.",
    parameters: { type: "object", properties: {} },
    skipPermission: true,
    handler: () => {
      const active = memories.filter((m) => !removedIds.has(m.id));
      return {
        textResultForLlm: JSON.stringify(active.map((m) => ({ id: m.id, scope: m.scope, statement: m.statement, confidence: m.confidence }))),
        resultType: "success" as const
      };
    }
  });

  const writeMemoryTool = defineTool("write_memory", {
    description: "Add a new memory or update an existing one (matched by statement). Only write durable, actionable knowledge.",
    parameters: {
      type: "object",
      properties: {
        statement: { type: "string" },
        scope: { type: "string", enum: ["user", "workspace"] },
        confidence: { type: "number", description: "0.0–1.0" }
      },
      required: ["statement", "scope"]
    },
    skipPermission: true,
    handler: (args) => {
      const statement = String(args.statement ?? "").trim();
      const scope = args.scope === "user" ? "user" : ("workspace" as const);
      const confidence = Math.min(1, Math.max(0, Number(args.confidence) || 0.85));
      if (statement.length < 10) return { textResultForLlm: "Statement too short.", resultType: "error" as const };

      const existing = memories.find((m) => m.statement === statement);
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.05);
        return { textResultForLlm: "Memory reinforced.", resultType: "success" as const };
      }
      const record: MemoryRecord = {
        id: makeId(statement),
        scope,
        statement,
        confidence,
        provenance: { source: "dream-run-agent", eventIds: [], capturedAt: nowIso }
      };
      memories.push(record);
      added.push(record);
      return { textResultForLlm: "Memory written.", resultType: "success" as const };
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
    ctx.metrics.contradictionsFound += removedIds.size;
  }

  return { tools: [listMemoriesTool, writeMemoryTool, removeMemoryTool], applyChanges };
}
