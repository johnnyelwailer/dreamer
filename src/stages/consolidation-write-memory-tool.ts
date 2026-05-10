import { defineTool } from "@github/copilot-sdk";
import { MEMORY_CATEGORIES, type MemoryRecord } from "../core/types.js";
import { EVIDENCE_ITEM_SCHEMA, REFERENCE_ITEM_SCHEMA, normalizeEvidence, normalizeReferences, normalizeTags, parseCategory, parseHorizon } from "./memory-tool-shared.js";

type CreateWriteMemoryToolOptions = {
  memories: MemoryRecord[];
  nowIso: string;
  onAdded: (record: MemoryRecord) => void;
  onUpdated: () => void;
};

function makeId(value: string): string {
  return `mem:${Buffer.from(value).toString("base64url").slice(0, 20)}`;
}

export function createWriteMemoryTool(options: CreateWriteMemoryToolOptions) {
  return defineTool("write_memory", {
    description: "Add or update memory by statement+scope. Requires reason, horizon, and at least one reference.",
    parameters: {
      type: "object",
      properties: {
        statement: { type: "string" },
        scope: { type: "string", enum: ["user", "workspace"] },
        confidence: { type: "number", description: "0.0-1.0" },
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        tags: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
        applies_when: { type: "string" },
        horizon: { type: "string", enum: ["short_term", "long_term"] },
        expires_at: { type: "string" },
        reason: { type: "string" },
        references: { type: "array", minItems: 1, items: REFERENCE_ITEM_SCHEMA },
        evidence: { type: "array", items: EVIDENCE_ITEM_SCHEMA }
      },
      required: ["statement", "scope", "reason", "references", "horizon"]
    },
    skipPermission: true,
    handler: (args) => {
      const statement = String(args.statement ?? "").trim();
      const scope = args.scope === "user" ? "user" : ("workspace" as const);
      const confidence = Math.min(1, Math.max(0, Number(args.confidence) || 0.85));
      if (statement.length < 10) return { textResultForLlm: "Statement too short.", resultType: "error" as const };

      const horizon = parseHorizon(args.horizon);
      if (!horizon) return { textResultForLlm: "Missing required horizon.", resultType: "error" as const };
      const expiresAt = String(args.expires_at ?? "").trim().slice(0, 40);
      if (horizon === "short_term" && expiresAt.length < 10) {
        return { textResultForLlm: "Short-term memories require expires_at.", resultType: "error" as const };
      }

      const reason = String(args.reason ?? "").trim().slice(0, 240);
      if (reason.length < 12) return { textResultForLlm: "reason must be meaningful.", resultType: "error" as const };

      const references = normalizeReferences(args.references);
      if (!references?.length) return { textResultForLlm: "At least one valid reference is required.", resultType: "error" as const };

      const category = parseCategory(args.category);
      const tags = normalizeTags(args.tags);
      const rationale = String(args.rationale ?? "").trim().slice(0, 240);
      const appliesWhen = String(args.applies_when ?? "").trim().slice(0, 180);
      const evidence = normalizeEvidence(args.evidence);

      const existing = options.memories.find((m) => m.statement === statement && m.scope === scope);
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.05);
        existing.context = {
          category: category ?? existing.context?.category,
          tags: [...new Set([...(existing.context?.tags ?? []), ...(tags ?? [])])].slice(0, 8),
          retention: horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          rationale: rationale || existing.context?.rationale,
          references: references.map((reference) => `${reference.kind}:${reference.value}`),
          appliesWhen: appliesWhen || existing.context?.appliesWhen
        };
        existing.capture = { horizon, expiresAt: horizon === "short_term" ? expiresAt : undefined, reason, references };
        if (evidence?.length) existing.evidence = evidence;
        options.onUpdated();
        return { textResultForLlm: "Memory reinforced.", resultType: "success" as const };
      }

      const record: MemoryRecord = {
        id: makeId(statement),
        scope,
        statement,
        confidence,
        provenance: { source: "dream-run-agent", eventIds: [], capturedAt: options.nowIso },
        context: {
          category,
          tags,
          retention: horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          rationale: rationale || reason,
          references: references.map((reference) => `${reference.kind}:${reference.value}`),
          appliesWhen: appliesWhen || undefined
        },
        evidence,
        capture: { horizon, expiresAt: horizon === "short_term" ? expiresAt : undefined, reason, references }
      };
      options.memories.push(record);
      options.onAdded(record);
      return { textResultForLlm: "Memory written.", resultType: "success" as const };
    }
  });
}
