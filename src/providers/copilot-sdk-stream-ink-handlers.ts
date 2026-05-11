import {
  delegatedAgentName,
  isSubagentStartEvent,
  isSubagentTerminalEvent,
  hasReasoningPayload,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import {
  eventSubagentId,
  isCompactionEvent
} from "./copilot-sdk-stream-ink-utils.js";
import { createToolEventHandlers } from "./copilot-sdk-stream-ink-tool-handlers.js";
import { createVerboseEventHandlers } from "./copilot-sdk-stream-ink-verbose-handlers.js";

type Store = {
  startSubagent: (id: string, name: string, task?: string, description?: string) => void;
  stopSubagent: (id: string) => void;
  startToolActivity: (input: Record<string, unknown>) => void;
  nextActivityId: (prefix?: string) => string;
  hasToolActivity: (id: string) => boolean;
  completeToolActivity: (input: Record<string, unknown>) => void;
  failToolActivity: (input: Record<string, unknown>) => void;
  updateSubagentTask: (id: string, task: string, toolName?: string, toolArgs?: string) => void;
  recordEvent: (input: Record<string, unknown>) => void;
};

type StreamState = {
  rememberSubagent: (record: CopilotEvent) => void;
  rememberDelegationRequest: (record: CopilotEvent, name: string) => void;
  rememberPendingTool: (record: CopilotEvent, pending: unknown) => void;
  consumePendingTool: (record: CopilotEvent) => { name: string; tag: string; args?: string; argsLines?: string[] } | undefined;
  toolTagFor: (name: string, record: CopilotEvent) => string;
  agentTagFor: (record: CopilotEvent) => string;
};

export function createInkEventHandlers(verbose: boolean, store: Store, state: StreamState) {
  const toolHandlers = createToolEventHandlers(store, state);
  const verboseHandlers = createVerboseEventHandlers(store, state);

  function handleSubagent(record: CopilotEvent, type: string): void {
    state.rememberSubagent(record);
    const id = eventSubagentId(record);
    const name = delegatedAgentName(record);
    if (isSubagentStartEvent(type)) {
      const description = toolHandlers.getPendingSubagentDescription();
      toolHandlers.setPendingSubagentDescription(undefined);
      store.startSubagent(id, name, undefined, description);
    }
    if (isSubagentTerminalEvent(type)) store.stopSubagent(id);
  }

  function handleTool(record: CopilotEvent, isStart: boolean): void {
    if (isStart) toolHandlers.handleToolStart(record);
    else toolHandlers.handleToolComplete(record);
  }

  function handleVerboseEvents(record: CopilotEvent, type: string): void {
    if (!verbose) return;

    if (type.includes("reasoning") || hasReasoningPayload(record)) {
      verboseHandlers.handleReasoning(record);
      if (type.includes("reasoning")) return;
    }

    if (type === "assistant.message" && !hasReasoningPayload(record)) {
      verboseHandlers.handleIntent(record);
      return;
    }

    if (type === "user.message") {
      verboseHandlers.handleUserMessage(record);
      return;
    }

    if (isCompactionEvent(type)) {
      verboseHandlers.handleCompactionEvent(record, type);
      return;
    }

    if (type.startsWith("session.")) {
      verboseHandlers.handleCompactionEvent(record, type);
      return;
    }
  }

  return {
    handleSubagent,
    handleTool,
    handleVerboseEvents
  };
}
