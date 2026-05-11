import { formatStructuredLines, pickArgObject, pickResultObject, truncate, type ToolEventData, wrapLine } from "./copilot-sdk-stream-verbose-helpers.js";

export function buildToolArgsVerboseLines(data: ToolEventData | undefined): string[] {
  if (!data) return [];
  const args = pickArgObject(data);
  return args ? formatStructuredLines(args, 12) : [];
}

export function buildToolResultVerboseLines(data: ToolEventData | undefined): string[] {
  if (!data) return [];
  const result = pickResultObject(data);
  return result ? formatStructuredLines(result, 12) : [];
}

export function buildReasoningVerboseLines(data: ToolEventData | undefined): string[] {
  if (!data) return [];
  const candidates: unknown[] = [
    data.reasoningText,
    data.reasoning,
    data.reasoningDelta,
    data.thinking,
    data.thought,
    (data.reasoning as Record<string, unknown> | undefined)?.content,
    (data.reasoning as Record<string, unknown> | undefined)?.text
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return wrapLine(truncate(candidate.replace(/\s+/g, " ").trim(), 900), 110);
    }
    if (Array.isArray(candidate) && candidate.length > 0) {
      return wrapLine(truncate(JSON.stringify(candidate), 900), 110);
    }
  }
  return [];
}

export function buildAssistantIntentLines(data: ToolEventData | undefined): string[] {
  if (!data) return [];
  const content = typeof data.content === "string" ? data.content.trim() : "";
  const toolRequests = Array.isArray(data.toolRequests) ? data.toolRequests : [];
  if (!content || toolRequests.length === 0) return [];
  const normalized = content.replace(/\s+/g, " ").trim();
  return wrapLine(truncate(normalized, 500), 110);
}