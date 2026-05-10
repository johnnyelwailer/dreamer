import { defineTool } from "@github/copilot-sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MEMORY_CATEGORIES, type InsightRecord } from "../core/types.js";
import { EVIDENCE_ITEM_SCHEMA, REFERENCE_ITEM_SCHEMA, normalizeEvidence, normalizeReferences, normalizeTags, parseCategory, parseHorizon } from "./memory-tool-shared.js";
import type { WrittenSession } from "./signal-stage-file-writer.js";
export function createSignalTools(
  runDir: string,
  sessions: WrittenSession[],
  onInsight: (insight: InsightRecord) => void,
  sessionHint?: { sessionId?: string },
  onFinalize?: (verdict: { status: string; summary: string }) => void
) {
  function safePath(p: string): string | null { const abs = resolve(p); return abs.startsWith(resolve(runDir)) ? abs : null; }
  const readFileTool = defineTool("read_file", {
    description: "Read lines from a file by absolute path. Use start_line/end_line (1-based) for ranges; defaults to first 120 lines.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" }
      },
      required: ["path"]
    },
    skipPermission: true,
    handler: async (args: Record<string, unknown>) => {
      const abs = safePath(String(args.path ?? ""));
      if (!abs) return { textResultForLlm: "Path not allowed.", resultType: "error" as const };
      try {
        const lines = (await readFile(abs, "utf8")).split("\n");
        const start = Math.max(1, Number(args.start_line) || 1);
        const end = Math.min(lines.length, Number(args.end_line) || start + 119);
        return {
          textResultForLlm: `[${start}-${end} of ${lines.length}]\n${lines.slice(start - 1, end).join("\n")}`,
          resultType: "success" as const
        };
      } catch {
        return { textResultForLlm: "File not found.", resultType: "error" as const };
      }
    }
  });
  const getMessageDetails = defineTool("get_message_details", {
    description: "Get raw event data (tool calls, arguments, results) for a message ID range in a session. Useful for drill-down after reading a session-N.md summary.",
    parameters: {
      type: "object",
      properties: {
        session: { type: "number", description: "Session number (1-based, matching session-N.md)" },
        from_msg: { type: "number", description: "First message [ID] to fetch (1-based)" },
        to_msg: { type: "number", description: "Last message [ID] inclusive. Defaults to from_msg." }
      },
      required: ["session", "from_msg"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const s = sessions[Number(args.session ?? 1) - 1];
      if (!s) return { textResultForLlm: "Session not found.", resultType: "error" as const };
      const from = Math.max(1, Number(args.from_msg) || 1);
      const to = Math.max(from, Number(args.to_msg) || from);
      const msgs = s.events.filter((e) => e.kind === "message");
      const fromMsg = msgs[from - 1];
      if (!fromMsg) return { textResultForLlm: "Message ID out of range.", resultType: "error" as const };
      const afterTo = msgs[to];
      const slice = s.events.filter(
        (e) => e.timestamp >= fromMsg.timestamp && (!afterTo || e.timestamp < afterTo.timestamp)
      );
      return {
        textResultForLlm: JSON.stringify(
          slice.map((e) => ({ kind: e.kind, role: e.metadata.role, tool: e.metadata.toolName, text: e.text.slice(0, 300) }))
        ),
        resultType: "success" as const
      };
    }
  });

  const recordInsight = defineTool("record_insight", {
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
        references: {
          type: "array",
          items: REFERENCE_ITEM_SCHEMA
        },
        evidence: {
          type: "array",
          items: EVIDENCE_ITEM_SCHEMA
        }
      },
      required: ["statement", "scope", "references"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const statement = String(args.statement ?? "").trim().slice(0, 200);
      const scope = args.scope === "workspace" ? "workspace" : ("user" as const);
      if (statement.length < 10) return { textResultForLlm: "Too short.", resultType: "error" as const };
      const category = parseCategory(args.category);
      const tags = normalizeTags(args.tags);
      const rationale = String(args.rationale ?? "").trim().slice(0, 240);
      const appliesWhen = String(args.applies_when ?? "").trim().slice(0, 180);
      const horizon = parseHorizon(args.horizon);
      const expiresAt = String(args.expires_at ?? "").trim().slice(0, 40);
      const reason = String(args.reason ?? "").trim().slice(0, 240);
      const references = normalizeReferences(args.references) ?? [];
      if (sessionHint?.sessionId && !references.some((reference) => reference.kind === "session")) {
        references.unshift({ kind: "session", value: sessionHint.sessionId, note: "Captured from analyzed session" });
      }
      if (references.length === 0) {
        return { textResultForLlm: "record_insight requires at least one reference (prefer kind=session).", resultType: "error" as const };
      }
      const evidence = normalizeEvidence(args.evidence) ?? [];
      if (!evidence.length && sessionHint?.sessionId) {
        evidence.push({ sessionId: sessionHint.sessionId });
      }
      if (!evidence.some((item) => typeof item.sessionId === "string" && item.sessionId.length > 0)) {
        return { textResultForLlm: "record_insight requires evidence with a session_id/sessionId.", resultType: "error" as const };
      }
      onInsight({
        statement,
        scope,
        context: {
          category,
          tags,
          rationale: rationale.length >= 12 ? rationale : undefined,
          appliesWhen: appliesWhen.length >= 8 ? appliesWhen : undefined
        },
        evidence: evidence.length ? evidence : undefined,
        capture: {
          horizon,
          expiresAt: expiresAt.length >= 16 ? expiresAt : undefined,
          reason: reason.length >= 12 ? reason : undefined,
          references
        }
      });
      return { textResultForLlm: "Insight recorded.", resultType: "success" as const };
    }
  });

  const finalizeSignalExtraction = defineTool("finalize_signal_extraction", {
    description: "Record the final signal extraction verdict before finishing this session.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["completed", "no_insights_found", "blocked"] },
        summary: { type: "string" }
      },
      required: ["status", "summary"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const status = String(args.status ?? "").trim().slice(0, 64);
      const summary = String(args.summary ?? "").trim().slice(0, 400);
      if (!status) {
        return { textResultForLlm: "finalize_signal_extraction requires a status.", resultType: "error" as const };
      }
      if (!summary) {
        return { textResultForLlm: "finalize_signal_extraction requires a summary.", resultType: "error" as const };
      }
      onFinalize?.({ status, summary });
      return { textResultForLlm: "Signal extraction verdict recorded.", resultType: "success" as const };
    }
  });

  return [readFileTool, getMessageDetails, recordInsight, finalizeSignalExtraction];
}
