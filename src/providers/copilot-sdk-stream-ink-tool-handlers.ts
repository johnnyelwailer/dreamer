import {
  buildToolArgsPreview,
  buildToolCallId,
  buildToolErrorPreview
} from "./copilot-sdk-stream-format.js";
import {
  getToolName,
  getToolSuccess,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import { buildToolArgsVerboseLines, buildToolResultVerboseLines } from "./copilot-sdk-stream-verbose-format.js";
import {
  eventSubagentId,
  summarize,
  summarizeTask,
  isDelegatedTag,
  extractDelegationDescription,
  activityTitleFromArgs
} from "./copilot-sdk-stream-ink-utils.js";

type Store = {
  startToolActivity: (input: Record<string, unknown>) => void;
  nextActivityId: (prefix?: string) => string;
  hasToolActivity: (id: string) => boolean;
  completeToolActivity: (input: Record<string, unknown>) => void;
  failToolActivity: (input: Record<string, unknown>) => void;
  updateSubagentTask: (id: string, task: string, toolName?: string, toolArgs?: string) => void;
};

type StreamState = {
  rememberDelegationRequest: (record: CopilotEvent, name: string) => void;
  rememberPendingTool: (record: CopilotEvent, pending: unknown) => void;
  consumePendingTool: (record: CopilotEvent) => { name: string; tag: string; args?: string; argsLines?: string[] } | undefined;
  toolTagFor: (name: string, record: CopilotEvent) => string;
};

export function createToolEventHandlers(store: Store, state: StreamState) {
  let pendingSubagentDescription: string | undefined;

  function handleToolStart(record: CopilotEvent): void {
    const name = getToolName(record);
    state.rememberDelegationRequest(record, name);
    const args = buildToolArgsPreview(record.data);
    const pending = {
      name,
      args,
      argsLines: buildToolArgsVerboseLines(record.data),
      tag: state.toolTagFor(name, record),
      activityId: ""
    };
    const callId = buildToolCallId(record.data);
    pending.activityId = callId?.trim() ? `${pending.tag}:${callId.trim()}` : store.nextActivityId(pending.tag);
    state.rememberPendingTool(record, pending);

    store.startToolActivity({
      id: pending.activityId,
      tag: pending.tag,
      toolName: name,
      title: activityTitleFromArgs(args),
      args: args?.trim() ? args : undefined
    });

    if (name === "task") {
      const description = extractDelegationDescription(record.data, args);
      if (description) pendingSubagentDescription = description;
    }

    const delegated = isDelegatedTag(pending.tag);
    if (delegated) {
      store.updateSubagentTask(eventSubagentId(record), summarizeTask(name, args), name, args);
    }
  }

  function handleToolComplete(record: CopilotEvent): void {
    const pending = state.consumePendingTool(record);
    const name = pending?.name ?? getToolName(record);
    const tag = pending?.tag ?? state.toolTagFor(name, record);
    const delegated = isDelegatedTag(tag);
    const argsPreview = pending?.args || buildToolArgsPreview(record.data);
    const callId = buildToolCallId(record.data);
    const activityId = pending?.activityId ?? (callId?.trim() ? `${tag}:${callId.trim()}` : store.nextActivityId(`${tag}:complete`));
    if (!store.hasToolActivity(activityId)) {
      store.startToolActivity({
        id: activityId,
        tag,
        toolName: name,
        title: activityTitleFromArgs(argsPreview),
        args: argsPreview?.trim() ? argsPreview : undefined
      });
    }

    const resultLines = buildToolResultVerboseLines(record.data);
    const resultSummary = resultLinesForActivity(resultLines);

    if (getToolSuccess(record) !== false) {
      store.completeToolActivity({ id: activityId, result: resultSummary ?? "ok" });
      if (delegated) {
        store.updateSubagentTask(eventSubagentId(record), `${name} completed`, name, pending?.args ?? argsPreview);
      }
      return;
    }
    const err = buildToolErrorPreview(record.data);
    if (delegated) {
      store.updateSubagentTask(eventSubagentId(record), err ? `failed: ${summarize(err, 84)}` : `${name} failed`, undefined, undefined);
    }
    store.failToolActivity({ id: activityId, error: err || "failed" });
  }

  return {
    handleToolStart,
    handleToolComplete,
    getPendingSubagentDescription: () => pendingSubagentDescription,
    setPendingSubagentDescription: (desc?: string) => { pendingSubagentDescription = desc; }
  };
}

function resultLinesForActivity(lines: string[]): string | undefined {
  const content = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line.length > 0 && line !== "result:").join(" ");
  return content ? summarize(content, 140) : undefined;
}
