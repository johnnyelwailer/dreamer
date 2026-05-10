import { defineTool } from "@github/copilot-sdk";
import type { InsightRecord, MemoryRecord } from "../core/types.js";
import { createWriteMemoryTool } from "./consolidation-write-memory-tool.js";
import { createReadReferenceTool } from "./consolidation-reference-tool.js";

export function createConsolidationTools(
  memories: MemoryRecord[],
  nowIso: string,
  insights: InsightRecord[],
  runId: string,
  workspaceDir: string,
  runDir: string
) {
  const added: MemoryRecord[] = [];
  let updated = 0;
  const removedIds = new Set<string>();
  let finalVerdict: { status: string; summary: string } | null = null;

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
            ?? m.context?.references?.map((value) => {
              const [kind, ...rest] = value.split(":");
              return { kind, value: rest.join(":") };
            }),
          rationale: m.context?.rationale,
          appliesWhen: m.context?.appliesWhen,
          evidence: m.evidence,
          provenance: m.provenance
        }))),
        resultType: "success" as const
      };
    }
  });

  const readReferenceTool = createReadReferenceTool({ workspaceDir, runDir });

  const writeMemoryTool = createWriteMemoryTool({
    memories,
    nowIso,
    insights,
    runId,
    workspaceDir,
    runDir,
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
      const input = args as Record<string, unknown>;
      const id = String(input.id ?? "");
      const exists = memories.some((m) => m.id === id);
      if (!exists) return { textResultForLlm: "Memory not found.", resultType: "error" as const };
      removedIds.add(id);
      return { textResultForLlm: "Memory removed.", resultType: "success" as const };
    }
  });

  const finalizeConsolidationTool = defineTool("finalize_consolidation", {
    description: "Record the final consolidation verdict before finishing the stage.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["completed", "no_changes_needed", "blocked"] },
        summary: { type: "string" }
      },
      required: ["status", "summary"]
    },
    skipPermission: true,
    handler: (args) => {
      const input = args as Record<string, unknown>;
      const status = String(input.status ?? "").trim().slice(0, 64);
      const summary = String(input.summary ?? "").trim().slice(0, 400);
      if (!status) {
        return { textResultForLlm: "finalize_consolidation requires a status.", resultType: "error" as const };
      }
      if (!summary) {
        return { textResultForLlm: "finalize_consolidation requires a summary.", resultType: "error" as const };
      }
      finalVerdict = { status, summary };
      return { textResultForLlm: "Consolidation verdict recorded.", resultType: "success" as const };
    }
  });

  function applyChanges(ctx: { memories: MemoryRecord[]; metrics: { memoriesAdded: number; memoriesUpdated: number; contradictionsFound: number } }): void {
    ctx.memories = memories.filter((m) => !removedIds.has(m.id));
    ctx.metrics.memoriesAdded += added.length;
    ctx.metrics.memoriesUpdated += updated;
    ctx.metrics.contradictionsFound += removedIds.size;
  }

  function hasFinalVerdict(): boolean {
    return finalVerdict !== null;
  }

  function getFinalVerdict(): { status: string; summary: string } | null {
    return finalVerdict;
  }

  return {
    tools: [listMemoriesTool, readReferenceTool, writeMemoryTool, removeMemoryTool, finalizeConsolidationTool],
    applyChanges,
    hasFinalVerdict,
    getFinalVerdict
  };
}
