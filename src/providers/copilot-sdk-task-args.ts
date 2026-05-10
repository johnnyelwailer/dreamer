const TASK_AGENT_KEYS = ["agent_type", "agentType", "subagent_type", "subagentType", "targetAgent", "agent"];
const TASK_WRAPPER_KEYS = ["input", "arguments", "args", "parameters"];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export function readTaskAgentType(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of TASK_AGENT_KEYS) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) return field.trim();
    const nested = asRecord(field)?.name;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return undefined;
}

export function normalizeTaskArgs(value: unknown): unknown {
  const parsed = parseJsonObject(value);
  if (parsed?.name && parsed.description && parsed.prompt) return parsed;

  const record = asRecord(parsed ?? value);
  if (!record || (record.name && record.description && record.prompt)) return value;
  for (const key of TASK_WRAPPER_KEYS) {
    const nested = asRecord(record[key]) ?? parseJsonObject(record[key]);
    if (nested?.name && nested.description && nested.prompt) {
      return { ...nested, agent_type: readTaskAgentType(nested) ?? readTaskAgentType(record) };
    }
  }
  return value;
}

export function describeTaskArgs(value: unknown): string {
  const normalized = normalizeTaskArgs(value);
  const record = asRecord(normalized);
  if (!record) return `type=${typeof normalized}`;
  const keys = Object.keys(record).sort().join(",");
  return `type=object keys=${keys || "(none)"} agent_type=${readTaskAgentType(record) ?? "(missing)"}`;
}
