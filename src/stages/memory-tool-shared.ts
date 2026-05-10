import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryEvidence, type MemoryReference } from "../core/types.js";

export const REFERENCE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["file", "url", "session", "doc"] },
    value: { type: "string" },
    note: { type: "string" }
  },
  required: ["kind", "value"]
} as const;

export const EVIDENCE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    session_id: { type: "string" },
    from_message: { type: "number" },
    to_message: { type: "number" },
    quote: { type: "string" }
  }
} as const;

export function parseCategory(value: unknown): MemoryCategory | undefined {
  return MEMORY_CATEGORIES.includes(value as MemoryCategory) ? (value as MemoryCategory) : undefined;
}

export function parseHorizon(value: unknown): "short_term" | "long_term" | undefined {
  if (value === "short_term" || value === "long_term") return value;
  return undefined;
}

export function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((tag) => String(tag).trim().toLowerCase())
    .filter((tag) => tag.length >= 2 && tag.length <= 24 && /^[a-z0-9-]+$/.test(tag));
  const unique = [...new Set(tags)].slice(0, 8);
  return unique.length ? unique : undefined;
}

export function normalizeEvidence(value: unknown): MemoryEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const evidence = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const fromMessage = Number(record.from_message);
      const toMessage = Number(record.to_message);
      const sessionId = String(record.session_id ?? "").trim().slice(0, 64);
      const quote = String(record.quote ?? "").trim().slice(0, 240);
      const next: MemoryEvidence = {};
      if (sessionId) next.sessionId = sessionId;
      if (Number.isFinite(fromMessage) && fromMessage >= 1) next.fromMessage = Math.trunc(fromMessage);
      if (Number.isFinite(toMessage) && toMessage >= 1) next.toMessage = Math.trunc(toMessage);
      if (quote.length >= 8) next.quote = quote;
      return Object.keys(next).length ? next : null;
    })
    .filter((entry): entry is MemoryEvidence => Boolean(entry));
  return evidence.length ? evidence.slice(0, 4) : undefined;
}

export function normalizeReferences(value: unknown): MemoryReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const references = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const kind = String(record.kind ?? "").trim().toLowerCase();
      const refValue = String(record.value ?? "").trim();
      const note = String(record.note ?? "").trim().slice(0, 120);
      if (!(kind === "file" || kind === "url" || kind === "session" || kind === "doc")) return null;
      if (!refValue || refValue.length > 220) return null;
      if (kind === "url" && !/^https?:\/\//i.test(refValue)) return null;
      const next: MemoryReference = { kind, value: refValue };
      if (note.length >= 3) next.note = note;
      return next;
    })
    .filter((entry): entry is MemoryReference => Boolean(entry));
  return references.length ? references.slice(0, 8) : undefined;
}
