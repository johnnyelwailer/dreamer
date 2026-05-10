type ToolEventData = Record<string, unknown>;

const PRIORITY_KEYS = [
  "filePath",
  "path",
  "uri",
  "query",
  "pattern",
  "command",
  "tool",
  "name"
] as const;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function compactPath(value: string): string {
  const home = process.env.HOME;
  const normalized = home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  if (normalized.length <= 44) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 4) return truncate(normalized, 44);
  return `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}`;
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

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    const maybePath = clean.startsWith("/") || clean.startsWith("~/") ? compactPath(clean) : clean;
    return JSON.stringify(truncate(maybePath, 42));
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  return "?";
}

function keyOrder(keys: string[]): string[] {
  const priority = new Map(PRIORITY_KEYS.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const ai = priority.get(a) ?? 999;
    const bi = priority.get(b) ?? 999;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
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

  const direct = Object.fromEntries(
    Object.entries(data).filter(([key]) =>
      key === "filePath" || key === "path" || key === "uri" || key === "query" || key === "pattern" || key === "command"
    )
  );
  return Object.keys(direct).length > 0 ? direct : undefined;
}

export function buildToolArgsPreview(data: ToolEventData | undefined): string {
  if (!data) return "";
  const argObject = pickArgObject(data);
  if (!argObject) return "";

  const keys = keyOrder(Object.keys(argObject));
  if (keys.length === 0) return "";
  const parts: string[] = [];
  for (const key of keys.slice(0, 5)) {
    parts.push(`${key}=${formatPrimitive(argObject[key])}`);
  }
  if (keys.length > 5) parts.push(`+${keys.length - 5} more`);
  return truncate(parts.join(" "), 140);
}

export function buildToolCallId(data: ToolEventData | undefined): string | undefined {
  if (!data) return undefined;
  const candidates: unknown[] = [
    data.callId,
    data.toolCallId,
    data.invocationId,
    data.requestId,
    data.id,
    (data.invocation as Record<string, unknown> | undefined)?.id,
    (data.invocation as Record<string, unknown> | undefined)?.callId
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
}

export function buildToolErrorPreview(data: ToolEventData | undefined): string {
  if (!data) return "";
  const candidates: unknown[] = [
    data.error,
    data.message,
    data.stderr,
    data.output,
    (data.result as Record<string, unknown> | undefined)?.error,
    (data.result as Record<string, unknown> | undefined)?.message
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return truncate(candidate.replace(/\s+/g, " ").trim(), 120);
    if (candidate && typeof candidate === "object") return truncate(JSON.stringify(candidate), 120);
  }
  return "";
}
