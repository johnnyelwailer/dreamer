import { defineTool } from "@github/copilot-sdk";
import { MEMORY_CATEGORIES, type InsightRecord } from "../core/types.js";
import { EVIDENCE_ITEM_SCHEMA, REFERENCE_ITEM_SCHEMA, normalizeEvidence, normalizeReferences, normalizeTags, parseCategory, parseHorizon } from "./memory-tool-shared.js";

const MAX_INSIGHT_STATEMENT_CHARS = 800;

function normalizeStatement(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (raw.length <= MAX_INSIGHT_STATEMENT_CHARS) return raw;
  const clipped = raw.slice(0, MAX_INSIGHT_STATEMENT_CHARS);
  const boundary = clipped.lastIndexOf(" ");
  if (boundary >= 40) return clipped.slice(0, boundary).trim();
  return clipped.trim();
}

export function createRecordInsightTool(
  onInsight: (insight: InsightRecord) => void,
  sessionHint?: { sessionId?: string; sessionReference?: string }
) {
  return defineTool("record_insight", {
    description: "Record a durable, actionable insight with required references and evidence tied to the analyzed session.",
    parameters: {
      type: "object",
      properties: {
        statement: { type: "string" },
        scope: { type: "string", enum: ["user", "workspace"] },
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        tags: { type: "array", items: { type: "string" } },
        rationale: { type: "string", description: "Why this is durable and worth keeping." },
        applies_when: { type: "string", description: "Context where this memory applies." },
        horizon: { type: "string", enum: ["short_term", "long_term"] },
        expires_at: { type: "string", description: "ISO timestamp for expiry. Usually used for short_term." },
        reason: { type: "string", description: "Reason this should be stored as memory." },
        references: { type: "array", items: REFERENCE_ITEM_SCHEMA },
        evidence: { type: "array", items: EVIDENCE_ITEM_SCHEMA }
      },
      required: ["statement", "scope", "references"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const statement = normalizeStatement(args.statement);
      if (statement.length < 10) return { textResultForLlm: "Too short.", resultType: "error" as const };
      const references = normalizeReferences(args.references) ?? [];
      const autoSessionReference = sessionHint?.sessionReference ?? sessionHint?.sessionId;
      if (autoSessionReference && !references.some((reference) => reference.kind === "session")) {
        references.unshift({ kind: "session", value: autoSessionReference, note: "Captured from analyzed session" });
      }
      if (references.length === 0) return { textResultForLlm: "record_insight requires at least one reference (prefer kind=session).", resultType: "error" as const };
      const evidence = normalizeEvidence(args.evidence) ?? [];
      if (!evidence.length && sessionHint?.sessionId) evidence.push({ sessionId: sessionHint.sessionId });
      if (!evidence.some((item) => typeof item.sessionId === "string" && item.sessionId.length > 0)) return { textResultForLlm: "record_insight requires evidence with a session_id/sessionId.", resultType: "error" as const };
      onInsight({
        statement,
        scope: args.scope === "workspace" ? "workspace" : "user",
        context: {
          category: parseCategory(args.category),
          tags: normalizeTags(args.tags),
          rationale: readOptional(args.rationale, 12, 240),
          appliesWhen: readOptional(args.applies_when, 8, 180)
        },
        evidence,
        capture: {
          horizon: parseHorizon(args.horizon),
          expiresAt: readOptional(args.expires_at, 16, 40),
          reason: readOptional(args.reason, 12, 240),
          references
        }
      });
      return { textResultForLlm: "Insight recorded.", resultType: "success" as const };
    }
  });
}

export function createFinalizeSignalExtractionTool(onFinalize?: (verdict: { status: string; summary: string }) => void) {
  return defineTool("finalize_signal_extraction", {
    description: "Record the final signal extraction verdict before finishing this session.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", enum: ["completed", "no_insights_found", "blocked"] }, summary: { type: "string" } },
      required: ["status", "summary"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const status = String(args.status ?? "").trim().slice(0, 64);
      const summary = String(args.summary ?? "").trim().slice(0, 400);
      if (!status) return { textResultForLlm: "finalize_signal_extraction requires a status.", resultType: "error" as const };
      if (!summary) return { textResultForLlm: "finalize_signal_extraction requires a summary.", resultType: "error" as const };
      onFinalize?.({ status, summary });
      return { textResultForLlm: "Signal extraction verdict recorded.", resultType: "success" as const };
    }
  });
}

function readOptional(value: unknown, minLength: number, maxLength: number): string | undefined {
  const trimmed = String(value ?? "").trim().slice(0, maxLength);
  return trimmed.length >= minLength ? trimmed : undefined;
}