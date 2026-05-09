import { readFile } from "node:fs/promises";

export type ToolJudgeScore = { id: string; score: number; rationale: string };
export type ToolJudgePayload = {
  scores: ToolJudgeScore[];
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
};

type TranscriptRecord = {
  type?: string;
  data?: {
    content?: string;
    toolRequests?: Array<{ name?: string }>;
  };
};

export function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(value);
}

export function extractAssistantText(response: unknown): string {
  const record = response as Record<string, unknown>;
  const content = (record?.data as Record<string, unknown> | undefined)?.content;
  return content ? normalizeText(content).trim() : normalizeText(response).trim();
}

export function validatePayload(input: unknown, dimensionIds: string[]): ToolJudgePayload {
  const record = input as Record<string, unknown>;
  const scores = Array.isArray(record?.scores) ? record.scores : [];
  const normalizedScores = scores
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.id === "string" && typeof entry.score === "number" && typeof entry.rationale === "string")
    .map((entry) => ({ id: String(entry.id), score: Number(entry.score), rationale: String(entry.rationale) }));

  const scoreIds = new Set(normalizedScores.map((score) => score.id));
  const hasAllDimensions = dimensionIds.every((id) => scoreIds.has(id));
  const validScores = normalizedScores.every((score) => score.score >= 0 && score.score <= 1);
  if (!hasAllDimensions || !validScores) {
    throw new Error("tool_payload_validation_failed");
  }

  const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    scores: normalizedScores,
    strengths: asStrings(record?.strengths),
    weaknesses: asStrings(record?.weaknesses),
    improvements: asStrings(record?.improvements)
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function readLines(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split("\n").filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function summarizeTranscriptLine(line: string): string {
  try {
    const parsed = JSON.parse(line) as TranscriptRecord;
    if (parsed.type === "user.message" || parsed.type === "assistant.message") {
      const content = parsed.data?.content?.trim();
      const toolRequests = (parsed.data?.toolRequests ?? [])
        .map((request) => request.name)
        .filter((name): name is string => Boolean(name));
      const text = content ?? (toolRequests.length > 0 ? `Tool requests: ${toolRequests.join(", ")}` : "");
      if (text.length > 0) return `${parsed.type}: ${text}`.slice(0, 280);
    }
    return line.slice(0, 280);
  } catch {
    return line.slice(0, 280);
  }
}
