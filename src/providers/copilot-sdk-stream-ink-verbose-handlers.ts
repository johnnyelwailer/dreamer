import {
  getUserMessageText,
  hasReasoningPayload,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import {
  buildAssistantIntentLines,
  buildReasoningVerboseLines
} from "./copilot-sdk-stream-verbose-format.js";
import {
  summarize,
  isCompactionEvent,
  summarizeEventPayload,
  isDelegatedTag,
  appendTaggedBlock,
  eventSubagentId
} from "./copilot-sdk-stream-ink-utils.js";

type Store = {
  updateSubagentTask: (id: string, task: string, toolName?: string, toolArgs?: string) => void;
  recordEvent: (input: Record<string, unknown>) => void;
};

type StreamState = {
  agentTagFor: (record: CopilotEvent) => string;
};

export function createVerboseEventHandlers(store: Store, state: StreamState) {
  function handleReasoning(record: CopilotEvent): void {
    const lines = buildReasoningVerboseLines(record.data);
    if (lines.length === 0) return;
    const tag = state.agentTagFor(record);
    if (isDelegatedTag(tag)) {
      store.updateSubagentTask(eventSubagentId(record), summarize(lines[0] ?? "reasoning", 96));
    } else {
      appendTaggedBlock(store, tag, ["reasoning:", ...lines.map((line) => `    ${line}`)], "signal");
    }
  }

  function handleIntent(record: CopilotEvent): void {
    const lines = buildAssistantIntentLines(record.data);
    const tag = state.agentTagFor(record);
    if (lines.length > 0) {
      if (isDelegatedTag(tag)) {
        store.updateSubagentTask(eventSubagentId(record), summarize(lines[0] ?? "working", 96));
      } else {
        appendTaggedBlock(store, tag, ["intent:", ...lines.map((line) => `    ${line}`)], "signal");
      }
      return;
    }

    const content = typeof record.data?.content === "string" ? record.data.content.trim() : "";
    if (content) {
      const contentLines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0).map((line) => summarize(line, 120));
      if (contentLines.length > 0) {
        if (isDelegatedTag(tag)) {
          store.updateSubagentTask(eventSubagentId(record), summarize(contentLines[0] ?? "working", 96));
        } else {
          appendTaggedBlock(store, tag, ["message:", ...contentLines.map((line) => `    ${line}`)], "signal");
        }
      }
    }
  }

  function handleUserMessage(record: CopilotEvent): void {
    const text = getUserMessageText(record);
    if (text) {
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0).map((line) => summarize(line, 120));
      if (lines.length > 0) appendTaggedBlock(store, "user", lines, "noisy");
    }
  }

  function handleCompactionEvent(record: CopilotEvent, type: string): void {
    const sourceTag = state.agentTagFor(record);
    const payloadSummary = summarizeEventPayload(record.data);
    store.recordEvent({ eventType: type, sourceTag, summary: payloadSummary || undefined });
  }

  return {
    handleReasoning,
    handleIntent,
    handleUserMessage,
    handleCompactionEvent
  };
}
