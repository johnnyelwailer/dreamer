import React, { createElement, useEffect, useState, useSyncExternalStore } from "react";
import { Box, Static, Text, render } from "ink";
import { buildToolArgsPreview, buildToolErrorPreview } from "./copilot-sdk-stream-format.js";
import {
  delegationPhase,
  delegatedAgentName,
  getToolName,
  getToolSuccess,
  hasReasoningPayload,
  isSubagentStartEvent,
  isSubagentTerminalEvent,
  isToolComplete,
  isToolStart,
  resolveVerboseDefault,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import { createStreamState } from "./copilot-sdk-stream-state.js";
import {
  buildAssistantIntentLines,
  buildReasoningVerboseLines,
  buildToolArgsVerboseLines,
  buildToolResultVerboseLines
} from "./copilot-sdk-stream-verbose-format.js";

type InkLogEntry = {
  id: number;
  tag: string;
  message: string;
  tone: "normal" | "noisy" | "error";
};

type InkSubagent = {
  id: string;
  name: string;
  description?: string;
  task: string;
  startedAt: number;
  toolName?: string;
  toolArgs?: string;
};

type InkSnapshot = {
  logs: InkLogEntry[];
  active: InkSubagent[];
};

const MAX_LOG_LINES = 300;

function colorForTag(tag: string): string {
  const key = tag.trim().toLowerCase();
  if (key === "delegate") return "yellow";
  if (key === "user") return "green";
  if (key.includes("@")) return "cyan";
  if (key.includes("agent")) return "magenta";
  if (key.includes("tool")) return "blue";
  return "white";
}

function eventSubagentId(record: CopilotEvent): string {
  const id = typeof record.agentId === "string" ? record.agentId.trim() : "";
  return id || delegatedAgentName(record);
}

function summarize(text: string, max = 96): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

function summarizeTask(toolName: string, argsPreview: string): string {
  if (!argsPreview.trim()) return `${toolName} in progress`;
  return summarize(`${toolName}: ${argsPreview}`, 96);
}

function previewValue(preview: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = preview.match(new RegExp(`(?:^|\\s)${escaped}=("(?:[^"\\\\]|\\\\.)*"|\\S+)`));
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  if (!raw.startsWith("\"")) return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return raw.slice(1, -1);
  }
}

function extractDelegationDescription(data: Record<string, unknown> | undefined, previewFallback: string | undefined): string | undefined {
  // Try to read description/name directly from raw args object (before any truncation)
  if (data) {
    const candidates = [
      data.arguments,
      data.args,
      data.parameters,
      data.input,
      data.toolInput
    ];
    for (const candidate of candidates) {
      let obj = candidate;
      if (typeof obj === "string") {
        try { obj = JSON.parse(obj) as unknown; } catch { continue; }
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const record = obj as Record<string, unknown>;
        const desc = typeof record.description === "string" ? record.description.trim() : undefined;
        if (desc) return summarize(desc, 96);
        const name = typeof record.name === "string" ? record.name.trim() : undefined;
        if (name) return summarize(name, 96);
      }
    }
    // Direct fields on data itself
    if (typeof data.description === "string" && data.description.trim()) return summarize(data.description.trim(), 96);
    if (typeof data.name === "string" && data.name.trim()) return summarize(data.name.trim(), 96);
  }
  // Fall back to parsing the preview string (may be truncated)
  return summarizeDelegationPreview(previewFallback);
}

function appendTaggedBlock(
  store: ReturnType<typeof createInkStore>,
  tag: string,
  lines: string[],
  tone: InkLogEntry["tone"]
): void {
  if (lines.length === 0) return;
  const first = lines[0] ?? "";
  store.appendLog(tag, first.startsWith(" ") ? first : ` ${first}`, tone);
  for (const line of lines.slice(1)) store.appendLog("", line, tone);
}

function appendToolBlock(
  store: ReturnType<typeof createInkStore>,
  tag: string,
  lines: string[],
  tone: InkLogEntry["tone"]
): void {
  if (lines.length === 0) return;
  store.appendLog(tag, "", tone);
  for (const line of lines) store.appendLog("", `  ${line}`, tone);
}

function createInkStore() {
  const listeners = new Set<() => void>();
  let seq = 1;
  let logs: InkLogEntry[] = [];
  let active: InkSubagent[] = [];
  let snapshot: InkSnapshot = { logs, active };

  function emit(): void {
    snapshot = { logs, active };
    for (const listener of listeners) listener();
  }

  function upsertActive(id: string, name: string, task?: string, toolName?: string, toolArgs?: string, description?: string): void {
    const byId = active.find((entry) => entry.id === id);
    // Some event streams start with a name-keyed placeholder row and later switch to a real agentId.
    // Merge these into one logical row to avoid duplicate subagent entries.
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
    appendLog(tag: string, message: string, tone: InkLogEntry["tone"] = "normal"): void {
      logs = [...logs, { id: seq++, tag, message, tone }].slice(-MAX_LOG_LINES);
      emit();
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

function InkView({ store }: { store: ReturnType<typeof createInkStore> }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    interval.unref?.();
    return () => clearInterval(interval);
  }, []);

  return createElement(
    Box,
    { flexDirection: "column" },
    createElement(
      Static,
      {
        items: snapshot.logs
      },
      (entry: InkLogEntry) =>
        createElement(
          Box,
          { key: entry.id },
          createElement(Text, { color: colorForTag(entry.tag) }, entry.tag ? `[${entry.tag}] ` : ""),
          createElement(Text, { color: entry.tone === "error" ? "red" : entry.tone === "noisy" ? "gray" : "white" }, entry.message)
        )
    ),
    snapshot.active.length > 0
      ? createElement(
          Box,
          { marginTop: 1, flexDirection: "column" },
          ...snapshot.active.map((entry) =>
            createElement(
              Box,
              { key: entry.id, flexDirection: "column" },
              createElement(Text, { color: "cyan" }, `- ${entry.name}`),
              entry.description
                ? createElement(Text, { color: "gray" }, `  ${entry.description}`)
                : null,
              entry.toolName
                ? createElement(
                    Box,
                    null,
                    createElement(Text, { color: "white" }, `  ${entry.toolName}`),
                    entry.toolArgs ? createElement(Text, { color: "gray" }, ` ${entry.toolArgs}`) : null
                  )
                : entry.task?.trim()
                  ? createElement(Text, { color: "gray" }, `  ${entry.task}`)
                  : null,
              createElement(Text, { color: "gray" }, `  ${Math.max(0, Math.floor((now - entry.startedAt) / 1000))}s`)
            )
          )
        )
      : null
  );
}

let _inkSingleton: { store: ReturnType<typeof createInkStore>; agentTag: string; verbose: boolean } | undefined;

function getOrCreateInkSingleton(agentTag: string, verbose: boolean): ReturnType<typeof createInkStore> {
  if (!_inkSingleton) {
    const store = createInkStore();
    const ink = render(createElement(InkView, { store }), {
      patchConsole: true,
      stdout: process.stdout,
      stderr: process.stderr
    });
    process.once("exit", () => ink.unmount());
    _inkSingleton = { store, agentTag, verbose };
  }
  return _inkSingleton.store;
}

export function createDreamAgentInkStreamHandler(options: { agentTag?: string; verbose?: boolean } = {}): ((event: unknown) => void) | undefined {
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  if (!interactive) return undefined;

  const agentTag = options.agentTag?.trim() || "dream agent";
  const verbose = resolveVerboseDefault(options.verbose);
  const state = createStreamState(agentTag);
  let pendingSubagentDescription: string | undefined;
  const store = getOrCreateInkSingleton(agentTag, verbose);

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (type.startsWith("subagent.")) {
      state.rememberSubagent(record);
      const id = eventSubagentId(record);
      const name = delegatedAgentName(record);
      if (isSubagentStartEvent(type)) {
        const description = pendingSubagentDescription;
        pendingSubagentDescription = undefined;
        store.startSubagent(id, name, undefined, description);
      }
      if (isSubagentTerminalEvent(type)) store.stopSubagent(id);
      return;
    }

    if (isToolStart(type)) {
      const name = getToolName(record);
      state.rememberDelegationRequest(record, name);
      const args = buildToolArgsPreview(record.data);
      const pending = {
        name,
        args,
        argsLines: buildToolArgsVerboseLines(record.data),
        tag: state.toolTagFor(name, record)
      };
      state.rememberPendingTool(record, pending);

      if (name === "delegate") return; // skip delegate entirely - it's internal plumbing

      if (name === "task") {
        // Capture description for the subagent that's about to start
        const description = extractDelegationDescription(record.data, args);
        if (description) pendingSubagentDescription = description;
        // Log task tool so user can see what the subagent was asked to do
        if (args?.trim()) appendToolBlock(store, pending.tag, [args], "noisy");
        return;
      }

      // Always update the live subagent row (works for both main agent and delegated subagents)
      store.updateSubagentTask(eventSubagentId(record), summarizeTask(name, args), name, args);
      // Only log to static feed for non-delegated (main agent) tools
      if (!isDelegatedTag(pending.tag) && !verbose && args?.trim()) {
        appendToolBlock(store, pending.tag, [args], "noisy");
      }
      return;
    }

    if (isToolComplete(type)) {
      const pending = state.consumePendingTool(record);
      const name = pending?.name ?? getToolName(record);
      // Skip logging task/delegate tool completion - they're meta, not real tool results
      if (name === "task" || name === "delegate") return;
      const tag = pending?.tag ?? state.toolTagFor(name, record);
      const delegated = isDelegatedTag(tag);
      if (verbose) {
        const argsLines = pending?.argsLines ?? [];
        const argsPreview = pending?.args || buildToolArgsPreview(record.data);
        if (!delegated) {
          const block: string[] = [];
          if (argsLines.length > 0) {
            block.push(argsLines[0] ?? "");
            block.push(...argsLines.slice(1).map((line) => `    ${line}`));
          } else if (argsPreview?.trim()) {
            block.push(argsPreview);
          }
          const resultLines = buildToolResultVerboseLines(record.data);
          if (resultLines.length > 0) {
            block.push("  result:");
            block.push(...resultLines.map((line) => `    ${line}`));
          }
          appendToolBlock(store, tag, block, "noisy");
        }
      }

      if (getToolSuccess(record) !== false) {
        // Only clear tool info for non-delegated tools
        if (!delegated) {
          store.updateSubagentTask(eventSubagentId(record), "", undefined, undefined);
          if (!verbose) appendToolBlock(store, tag, ["completed ✓"], "noisy");
        }
        return;
      }
      const err = buildToolErrorPreview(record.data);
      store.updateSubagentTask(eventSubagentId(record), err ? `failed: ${summarize(err, 84)}` : `${name} failed`, undefined, undefined);
      appendToolBlock(store, tag, [err ? `failed: ${err}` : "failed"], "error");
      return;
    }

    if (verbose && (type.includes("reasoning") || hasReasoningPayload(record))) {
      const lines = buildReasoningVerboseLines(record.data);
      if (lines.length > 0) {
        const tag = state.agentTagFor(record);
        if (isDelegatedTag(tag)) {
          // For delegated agents, show current reasoning in their task row
          store.updateSubagentTask(eventSubagentId(record), summarize(lines[0] ?? "reasoning", 96));
        } else {
          appendTaggedBlock(store, tag, ["reasoning:", ...lines.map((line) => `    ${line}`)], "noisy");
        }
      }
      if (type.includes("reasoning")) return;
    }

    if (verbose && type === "assistant.message" && !hasReasoningPayload(record)) {
      const lines = buildAssistantIntentLines(record.data);
      if (lines.length > 0) {
        const tag = state.agentTagFor(record);
        if (isDelegatedTag(tag)) {
          // For delegated agents, show current intent in their task row
          store.updateSubagentTask(eventSubagentId(record), summarize(lines[0] ?? "working", 96));
        } else {
          appendTaggedBlock(store, tag, ["intent:", ...lines.map((line) => `    ${line}`)], "noisy");
        }
      }
    }
  };
}
