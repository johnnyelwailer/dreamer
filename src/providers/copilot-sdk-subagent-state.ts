import { isSubagentStartEvent, isSubagentTerminalEvent } from "./copilot-sdk-stream-event-helpers.js";

type SubagentEvent = {
  type?: string;
  agentId?: string;
  data?: Record<string, unknown>;
};

function readName(event: SubagentEvent): string | undefined {
  const data = event.data ?? {};
  const candidates = [
    data.agentName,
    data.subagentName,
    data.targetAgent,
    (data.subagent as Record<string, unknown> | undefined)?.name,
    (data.agent as Record<string, unknown> | undefined)?.name
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)?.trim();
}

function readId(event: SubagentEvent): string | undefined {
  const direct = event.agentId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = event.data?.agentId;
  return typeof nested === "string" && nested.trim() ? nested.trim() : undefined;
}

export function createSubagentState(initialAgent?: string): {
  describe: () => string;
  activeCount: () => number;
  isActive: () => boolean;
  onEvent: (event: unknown) => void;
} {
  const activeById = new Map<string, string>();
  let selectedAgent = initialAgent?.trim() || undefined;
  let anonymousActive = 0;

  function onEvent(raw: unknown): void {
    const event = (raw ?? {}) as SubagentEvent;
    const type = event.type?.toLowerCase() ?? "";
    const id = readId(event);
    const name = readName(event);
    if (type === "subagent.selected" && name) selectedAgent = name;
    if (type === "subagent.deselected") selectedAgent = undefined;
    if (isSubagentStartEvent(type)) {
      if (id) activeById.set(id, name ?? id);
      else anonymousActive += 1;
    }
    if (isSubagentTerminalEvent(type)) {
      if (id) activeById.delete(id);
      else anonymousActive = Math.max(0, anonymousActive - 1);
    }
  }

  function isActive(): boolean {
    return Boolean(selectedAgent || activeById.size > 0 || anonymousActive > 0);
  }

  function activeCount(): number {
    const explicitActive = activeById.size + anonymousActive;
    if (selectedAgent && explicitActive === 0) return 1;
    return explicitActive;
  }

  function describe(): string {
    const named = [...activeById.entries()].map(([id, name]) => `${name}(${id})`);
    const selected = selectedAgent ? [`selected=${selectedAgent}`] : [];
    const anonymous = anonymousActive > 0 ? [`anonymous=${anonymousActive}`] : [];
    return [...selected, ...named, ...anonymous].join(", ") || "none";
  }

  return { describe, activeCount, isActive, onEvent };
}
