import { ttyWriteContinuation, ttyWriteTagged } from "../shared/tty-log-format.js";
import { getUserMessageText, type CopilotEvent } from "./copilot-sdk-stream-event-helpers.js";
import {
  buildAssistantIntentLines,
  buildReasoningVerboseLines
} from "./copilot-sdk-stream-verbose-format.js";

type StreamState = {
  agentTagFor: (record: CopilotEvent) => string;
};

export function createMessageHandlers(toolStream: NodeJS.WritableStream, state: StreamState, closeStreamingLine: () => void) {
  function handleReasoning(record: CopilotEvent): void {
    const lines = buildReasoningVerboseLines(record.data);
    if (lines.length === 0) return;
    closeStreamingLine();
    ttyWriteTagged(state.agentTagFor(record), "reasoning:", { noisy: true, stream: toolStream });
    for (const line of lines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function handleIntent(record: CopilotEvent): void {
    const lines = buildAssistantIntentLines(record.data);
    if (lines.length === 0) return;
    closeStreamingLine();
    ttyWriteTagged(state.agentTagFor(record), "intent:", { noisy: true, stream: toolStream });
    for (const line of lines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function handleUserMessage(record: CopilotEvent): void {
    const text = getUserMessageText(record);
    if (!text) return;
    closeStreamingLine();
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    ttyWriteTagged("user", lines[0], { noisy: true, stream: toolStream });
    for (const line of lines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 2, stream: toolStream });
  }

  return {
    handleReasoning,
    handleIntent,
    handleUserMessage
  };
}
