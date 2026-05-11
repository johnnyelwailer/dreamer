import { clearScreenDown, cursorTo, moveCursor } from "node:readline";
import { buildToolArgsPreview } from "./copilot-sdk-stream-format.js";
import { delegatedAgentName, type CopilotEvent } from "./copilot-sdk-stream-event-helpers.js";

type ActiveSubagent = {
  name: string;
  task: string;
  startedAt: number;
};

function eventSubagentId(record: CopilotEvent): string {
  const id = typeof record.agentId === "string" ? record.agentId.trim() : "";
  return id || delegatedAgentName(record);
}

function summarize(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function summarizeTask(toolName: string, record: CopilotEvent): string | undefined {
  if (toolName === "task" || toolName === "delegate") {
    const description = typeof record.data?.description === "string" ? record.data.description.trim() : "";
    if (description) return summarize(description, 84);
  }

  const args = buildToolArgsPreview(record.data);
  if (args.trim()) return summarize(`${toolName}: ${args}`, 84);
  return summarize(`${toolName} in progress`, 84);
}

export function createSubagentDashboard(stream: NodeJS.WriteStream = process.stderr) {
  const active = new Map<string, ActiveSubagent>();
  const pendingDescriptions: string[] = [];
  let renderedLineCount = 0;
  let refreshTimer: NodeJS.Timeout | undefined;
  let suspendDepth = 0;

  function clearDashboard(): void {
    if (renderedLineCount <= 0) return;
    moveCursor(stream, 0, -renderedLineCount);
    cursorTo(stream, 0);
    clearScreenDown(stream);
    renderedLineCount = 0;
  }

  function renderAll(): void {
    if (suspendDepth > 0) return;
    const entries = [...active.values()].sort((a, b) => a.startedAt - b.startedAt);
    if (entries.length === 0) {
      clearDashboard();
      return;
    }

    const lines = entries.flatMap((entry) => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - entry.startedAt) / 1000));
      return [`- ${entry.name}`, `  ${entry.task}`, `  ${elapsedSeconds}s`];
    });

    clearDashboard();
    stream.write(`${lines.join("\n")}\n`);
    renderedLineCount = lines.length;
  }

  function ensureRefreshTimer(): void {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => {
      renderAll();
    }, 1000);
    refreshTimer.unref();
  }

  function stopRefreshTimerIfIdle(): void {
    if (!refreshTimer || active.size > 0) return;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }

  return {
    withSuspended<T>(write: () => T): T {
      suspendDepth += 1;
      if (suspendDepth === 1) clearDashboard();
      try {
        return write();
      } finally {
        suspendDepth -= 1;
        if (suspendDepth === 0) renderAll();
      }
    },
    rememberTask(toolName: string, record: CopilotEvent): void {
      if (toolName === "task" || toolName === "delegate") {
        const task = summarizeTask(toolName, record);
        if (task) pendingDescriptions.push(task);
      }

      const id = eventSubagentId(record);
      const current = active.get(id);
      if (!current) return;
      const task = summarizeTask(toolName, record);
      if (!task) return;
      current.task = task;
      renderAll();
    },
    start(record: CopilotEvent): void {
      const id = eventSubagentId(record);
      active.set(id, {
        name: delegatedAgentName(record),
        task: pendingDescriptions.shift() ?? "working",
        startedAt: Date.now()
      });
      ensureRefreshTimer();
      renderAll();
    },
    stop(record: CopilotEvent): void {
      const id = eventSubagentId(record);
      active.delete(id);
      renderAll();
      stopRefreshTimerIfIdle();
    },
    render(record: CopilotEvent): void {
      const id = eventSubagentId(record);
      if (!active.has(id)) return;
      renderAll();
    }
  };
}