import { delegatedAgentName, type CopilotEvent } from "./copilot-sdk-stream-event-helpers.js";
import {
  summarize,
  summarizeTask,
  summarizeEventPayload,
  summarizeDelegationPreview,
  activityTitleFromArgs,
  extractDelegationDescription
} from "./copilot-sdk-stream-ink-utils-format.js";

export type InkLogEntry = {
  id: number;
  tag: string;
  message: string;
  tone: "normal" | "noisy" | "error" | "signal";
};

export type InkSubagent = {
  id: string;
  name: string;
  description?: string;
  task: string;
  startedAt: number;
  toolName?: string;
  toolArgs?: string;
};

export type InkToolActivity = {
  id: string;
  tag: string;
  toolName: string;
  title?: string;
  args?: string;
  status: "running" | "completed" | "failed";
  result?: string;
  error?: string;
};

export type InkEventActivity = {
  id: string;
  eventType: string;
  sourceTag: string;
  summary?: string;
  count: number;
};

export type InkSnapshot = {
  logs: InkLogEntry[];
  events: InkEventActivity[];
  activities: InkToolActivity[];
  active: InkSubagent[];
};

// Re-export for convenience
export { summarize, summarizeTask, summarizeEventPayload, summarizeDelegationPreview, activityTitleFromArgs, extractDelegationDescription };

export function colorForTag(tag: string): string {
  const key = tag.trim().toLowerCase();
  if (key === "event") return "gray";
  if (key === "delegate") return "yellow";
  if (key === "user") return "green";
  if (key.includes("@")) return "cyan";
  if (key.includes("agent")) return "magenta";
  if (key.includes("tool")) return "blue";
  return "white";
}

export function eventSubagentId(record: CopilotEvent): string {
  const id = typeof record.agentId === "string" ? record.agentId.trim() : "";
  return id || delegatedAgentName(record);
}

export function isCompactionEvent(type: string): boolean {
  return type.toLowerCase().includes("compact");
}

export function isDelegatedTag(tag: string): boolean {
  return tag.includes("@");
}

export function appendTaggedBlock(
  store: { appendLog: (tag: string, message: string, tone: InkLogEntry["tone"]) => void },
  tag: string,
  lines: string[],
  tone: InkLogEntry["tone"]
): void {
  if (lines.length === 0) return;
  const first = lines[0] ?? "";
  store.appendLog(tag, first.startsWith(" ") ? first : ` ${first}`, tone);
  for (const line of lines.slice(1)) store.appendLog("", line, tone);
}

export function eventActivityId(eventType: string, sourceTag: string, payloadSummary?: string): string {
  return `${eventType}@${sourceTag}:${payloadSummary ?? ""}`;
}
