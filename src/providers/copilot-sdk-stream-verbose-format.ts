type ToolEventData = Record<string, unknown>;

const KEY_PRIORITY = [
  "prompt",
  "agent_type",
  "agentType",
  "name",
  "description",
  "filePath",
  "path",
  "uri",
  "query",
  "pattern",
  "command",
] as const;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}...`;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function formatValue(value: unknown, max = 120): string {
  if (typeof value === "string") return JSON.stringify(truncate(value.replace(/\s+/g, " ").trim(), max));
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const primitive = value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
    if (!primitive) return `[${value.length}]`;
    const sample = value.slice(0, 4).map((item) => formatValue(item, 36)).join(", ");
    return value.length > 4 ? `[${value.length}] ${sample}, ...` : `[${value.length}] ${sample}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return `{${keys.length} keys}`;
  }
  return "?";
}

function wrapLine(line: string, width = 110): string[] {
  if (line.length <= width) return [line];
  const out: string[] = [];
  let remaining = line;
  while (remaining.length > width) {
    out.push(remaining.slice(0, width));
    remaining = `  ${remaining.slice(width)}`;
  }
  out.push(remaining);
  return out;
}

function keyOrder(keys: string[]): string[] {
  const rank = new Map(KEY_PRIORITY.map((key, index) => [key, index]));
  return [...keys].sort((a, b) => {
    const ai = rank.get(a) ?? 999;
    const bi = rank.get(b) ?? 999;
    return ai !== bi ? ai - bi : a.localeCompare(b);
  });
}

function pickArgObject(data: ToolEventData): Record<string, unknown> | undefined {
  const candidates: unknown[] = [
    data.arguments,
    data.args,
    data.parameters,
    data.input,
    data.toolInput,
    (data.invocation as Record<string, unknown> | undefined)?.arguments,
    (data.invocation as Record<string, unknown> | undefined)?.input
  ];
  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return undefined;
}

function pickResultObject(data: ToolEventData): Record<string, unknown> | undefined {
  const candidates: unknown[] = [
    data.result,
    data.output,
    data.response,
    data.value,
    data.returnValue,
    (data.invocation as Record<string, unknown> | undefined)?.result
  ];
  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return undefined;
}

function formatStructuredLines(record: Record<string, unknown>, maxKeys: number): string[] {
  const keys = keyOrder(Object.keys(record));
  const lines: string[] = [];
  for (const key of keys.slice(0, maxKeys)) {
    lines.push(...wrapLine(`${key}: ${formatValue(record[key])}`));
  }
  if (keys.length > maxKeys) lines.push(`... +${keys.length - maxKeys} more keys`);
  return lines;
}

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