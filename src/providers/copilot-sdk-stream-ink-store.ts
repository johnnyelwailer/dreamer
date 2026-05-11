import { type InkLogEntry, type InkToolActivity, type InkSubagent, type InkEventActivity, type InkSnapshot } from "./copilot-sdk-stream-ink-utils.js";
import { eventActivityId } from "./copilot-sdk-stream-ink-utils.js";
import { summarize } from "./copilot-sdk-stream-ink-utils-format.js";

const MAX_LOG_LINES = 300;

export function createInkStore() {
  const listeners = new Set<() => void>();
  let seq = 1;
  let activitySeq = 1;
  let logs: InkLogEntry[] = [];
  const eventById = new Map<string, InkEventActivity>();
  let events: InkEventActivity[] = [];
  const activityById = new Map<string, InkToolActivity>();
  let activities: InkToolActivity[] = [];
  let active: InkSubagent[] = [];
  let snapshot: InkSnapshot = { logs, events, activities, active };

  function emit(): void {
    snapshot = { logs, events, activities, active };
    for (const listener of listeners) listener();
  }

  function upsertEvent(entry: InkEventActivity): void {
    eventById.set(entry.id, entry);
    events = [...eventById.values()].slice(-MAX_LOG_LINES);
    const keepIds = new Set(events.map((event) => event.id));
    for (const id of [...eventById.keys()]) {
      if (!keepIds.has(id)) eventById.delete(id);
    }
    emit();
  }

  function upsertActivity(entry: InkToolActivity): void {
    activityById.set(entry.id, entry);
    const ordered = [...activityById.values()];
    activities = ordered.slice(-MAX_LOG_LINES);
    const keepIds = new Set(activities.map((activity) => activity.id));
    for (const id of [...activityById.keys()]) {
      if (!keepIds.has(id)) activityById.delete(id);
    }
    emit();
  }

  function upsertActive(id: string, name: string, task?: string, toolName?: string, toolArgs?: string, description?: string): void {
    const byId = active.find((entry) => entry.id === id);
    const byName = byId ? undefined : active.find((entry) => entry.name === name);
    const found = byId ?? byName;
    if (found) {
      if (found.id !== id) found.id = id;
      found.name = name;
      if (task !== undefined) found.task = summarize(task, 96);
      if (toolName !== undefined) found.toolName = toolName;
      if (toolArgs !== undefined) found.toolArgs = toolArgs;
      if (description !== undefined) found.description = description;
      emit();
      return;
    }
    active = [...active, { id, name, description, task: task ?? "working", startedAt: Date.now(), toolName, toolArgs }];
    emit();
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): InkSnapshot {
      return snapshot;
    },
    nextActivityId(prefix = "tool"): string {
      const id = `${prefix}:${activitySeq}`;
      activitySeq += 1;
      return id;
    },
    appendLog(tag: string, message: string, tone: InkLogEntry["tone"] = "normal"): void {
      logs = [...logs, { id: seq++, tag, message, tone }].slice(-MAX_LOG_LINES);
      emit();
    },
    recordEvent(input: { eventType: string; sourceTag: string; summary?: string }): void {
      const id = eventActivityId(input.eventType, input.sourceTag, input.summary);
      const existing = eventById.get(id);
      upsertEvent({
        id,
        eventType: input.eventType,
        sourceTag: input.sourceTag,
        summary: input.summary,
        count: (existing?.count ?? 0) + 1
      });
    },
    startToolActivity(input: { id: string; tag: string; toolName: string; title?: string; args?: string }): void {
      upsertActivity({
        id: input.id,
        tag: input.tag,
        toolName: input.toolName,
        title: input.title,
        args: input.args,
        status: "running"
      });
    },
    completeToolActivity(input: { id: string; result?: string }): void {
      const existing = activityById.get(input.id);
      if (!existing) return;
      upsertActivity({ ...existing, status: "completed", result: input.result, error: undefined });
    },
    failToolActivity(input: { id: string; error: string }): void {
      const existing = activityById.get(input.id);
      if (!existing) return;
      upsertActivity({ ...existing, status: "failed", error: input.error, result: undefined });
    },
    hasToolActivity(id: string): boolean {
      return activityById.has(id);
    },
    startSubagent(id: string, name: string, task?: string, description?: string): void {
      upsertActive(id, name, task, undefined, undefined, description);
    },
    updateSubagentTask(id: string, task: string, toolName?: string, toolArgs?: string): void {
      const found = active.find((entry) => entry.id === id) ?? active.find((entry) => entry.name === id);
      if (!found) return;
      if (task !== undefined) found.task = summarize(task, 96);
      found.toolName = toolName ?? "";
      found.toolArgs = toolArgs ?? "";
      emit();
    },
    stopSubagent(id: string): void {
      const next = active.filter((entry) => entry.id !== id && entry.name !== id);
      if (next.length === active.length) return;
      active = next;
      emit();
    }
  };
}
