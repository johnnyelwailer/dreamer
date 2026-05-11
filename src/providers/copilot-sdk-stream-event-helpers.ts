export type CopilotEvent = {
  agentId?: string;
  id?: string;
  parentId?: string | null;
  type?: string;
  data?: Record<string, unknown> & {
    deltaContent?: unknown;
    content?: unknown;
    toolName?: unknown;
    success?: unknown;
    tool?: { name?: unknown };
    invocation?: { toolName?: unknown };
  };
};

export function isEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function resolveVerboseDefault(explicit: boolean | undefined): boolean {
  if (typeof explicit === "boolean") return explicit;
  const raw = process.env.DREAM_STREAM_VERBOSE ?? process.env.DREAM_AGENT_LOG_VERBOSE;
  if (raw === undefined) return true;
  const value = raw.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(value)) return false;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  return true;
}

export function getDeltaText(record: CopilotEvent): string {
  return typeof record.data?.deltaContent === "string"
    ? record.data.deltaContent
    : typeof record.data?.content === "string"
      ? record.data.content
      : "";
}

export function getUserMessageText(record: CopilotEvent): string {
  return typeof record.data?.content === "string" && record.data.content.trim().length > 0 ? record.data.content : "";
}

export function getToolName(record: CopilotEvent): string {
  const candidates = [
    record.data?.toolName,
    (record.data?.tool as { name?: unknown } | undefined)?.name,
    (record.data?.invocation as { toolName?: unknown } | undefined)?.toolName,
    record.data?.name
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)?.trim() ?? "unknown-tool";
}

export function isToolStart(type: string): boolean {
  return type === "tool.execution_start" || /tool\..*(start|begin|created)$/i.test(type);
}

export function isToolComplete(type: string): boolean {
  return type === "tool.execution_complete" || /tool\..*(complete|finish|done|end|fail(?:ed)?|error(?:ed)?|cancel(?:led)?|abort(?:ed)?|stop(?:ped)?|terminate(?:d)?|reject(?:ed)?)$/i.test(type);
}

export function getToolSuccess(record: CopilotEvent): boolean | undefined {
  if (record.data?.success === true) return true;
  if (record.data?.success === false) return false;
  const status = typeof record.data?.status === "string" ? record.data.status.toLowerCase() : "";
  if (status.includes("ok") || status.includes("success")) return true;
  if (status.includes("fail") || status.includes("error")) return false;
  return undefined;
}

export function hasReasoningPayload(record: CopilotEvent): boolean {
  const data = record.data ?? {};
  return Boolean(data.reasoningText || data.reasoning || data.reasoningDelta || data.thinking || data.thought);
}

export function delegationPhase(type: string): "start" | "done" | "failed" | undefined {
  const value = type.toLowerCase();
  if (!value.includes("subagent") && !value.includes("delegat")) return undefined;
  if (value.includes("start") || value.includes("begin") || value.includes("created")) return "start";
  if (
    value.includes("fail")
    || value.includes("error")
    || value.includes("cancel")
    || value.includes("abort")
    || value.includes("reject")
  ) {
    return "failed";
  }
  if (value.includes("done") || value.includes("complete") || value.includes("finish") || value.includes("success")) return "done";
  return undefined;
}

export function isSubagentStartEvent(type: string): boolean {
  const value = type.toLowerCase();
  return value.includes("subagent") && (value.includes("start") || value.includes("begin") || value.includes("created"));
}

export function isSubagentTerminalEvent(type: string): boolean {
  const value = type.toLowerCase();
  return value.includes("subagent") && (
    value.includes("done")
    || value.includes("complete")
    || value.includes("finish")
    || value.includes("success")
    || value.includes("fail")
    || value.includes("error")
    || value.includes("cancel")
    || value.includes("abort")
    || value.includes("reject")
    || value.includes("terminate")
    || value.includes("stop")
  );
}

export function delegatedAgentName(record: CopilotEvent): string {
  return eventSubagentName(record) ?? "unknown-subagent";
}

export function eventSubagentName(record: CopilotEvent): string | undefined {
  const data = record.data ?? {};
  const candidates: unknown[] = [
    data.agentName,
    data.subagentName,
    data.targetAgent,
    (data.subagent as Record<string, unknown> | undefined)?.name,
    (data.agent as Record<string, unknown> | undefined)?.name
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)?.trim();
}