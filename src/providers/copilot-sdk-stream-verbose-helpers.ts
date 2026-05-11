export type ToolEventData = Record<string, unknown>;

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
  "command"
] as const;

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}...`;
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function wrapLine(line: string, width = 110): string[] {
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
  return [...keys].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b));
}

function formatValue(value: unknown, max = 120): string {
  if (typeof value === "string") return JSON.stringify(truncate(value.replace(/\s+/g, " ").trim(), max));
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return formatArrayValue(value);
  if (typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).length} keys}`;
  return "?";
}

function formatArrayValue(value: unknown[]): string {
  if (value.length === 0) return "[]";
  const primitive = value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item));
  if (!primitive) return `[${value.length}]`;
  const sample = value.slice(0, 4).map((item) => formatValue(item, 36)).join(", ");
  return value.length > 4 ? `[${value.length}] ${sample}, ...` : `[${value.length}] ${sample}`;
}

function pickObject(data: ToolEventData, keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const parsed = parseMaybeJson(data[key]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return undefined;
}

export function pickArgObject(data: ToolEventData): Record<string, unknown> | undefined {
  return pickObject(data, ["arguments", "args", "parameters", "input", "toolInput"])
    ?? pickObject((data.invocation as Record<string, unknown> | undefined) ?? {}, ["arguments", "input"]);
}

export function pickResultObject(data: ToolEventData): Record<string, unknown> | undefined {
  return pickObject(data, ["result", "output", "response", "value", "returnValue"])
    ?? pickObject((data.invocation as Record<string, unknown> | undefined) ?? {}, ["result"]);
}

export function formatStructuredLines(record: Record<string, unknown>, maxKeys: number): string[] {
  const keys = keyOrder(Object.keys(record));
  const lines: string[] = [];
  for (const key of keys.slice(0, maxKeys)) lines.push(...wrapLine(`${key}: ${formatValue(record[key])}`));
  if (keys.length > maxKeys) lines.push(`... +${keys.length - maxKeys} more keys`);
  return lines;
}