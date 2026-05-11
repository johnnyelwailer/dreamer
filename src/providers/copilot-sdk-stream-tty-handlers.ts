import { ttyFormat, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildToolArgsPreview } from "./copilot-sdk-stream-format.js";
import {
  delegatedAgentName,
  getDeltaText,
  getToolName,
  getToolSuccess,
  hasReasoningPayload,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import { buildToolArgsVerboseLines } from "./copilot-sdk-stream-verbose-format.js";
import { createToolHandlers } from "./copilot-sdk-stream-tty-tool-handlers.js";
import { createMessageHandlers } from "./copilot-sdk-stream-tty-message-handlers.js";

type StreamState = {
  consumeDelegationRequest: (record: CopilotEvent) => { argsPreview?: string } | undefined;
  rememberDelegationRequest: (record: CopilotEvent, name: string) => void;
  rememberPendingTool: (record: CopilotEvent, pending: unknown) => void;
  consumePendingTool: (record: CopilotEvent) => { name: string; tag: string; args?: string; argsLines?: string[] } | undefined;
  toolTagFor: (name: string, record: CopilotEvent) => string;
  isDelegated: (record: CopilotEvent) => boolean;
  agentTagFor: (record: CopilotEvent) => string;
};

export function createTtyStreamHandlers(interactive: boolean, verbose: boolean, toolStream: NodeJS.WritableStream, state: StreamState) {
  let streamingLineOpen = false;
  let streamingTag: string | undefined;
  const toolHandlers = createToolHandlers(interactive, verbose, toolStream);
  const msgHandlers = createMessageHandlers(toolStream, state, closeStreamingLine);

  function closeStreamingLine(): void {
    toolStream.write("\n");
    streamingLineOpen = false;
    streamingTag = undefined;
  }

  function handleDelegation(record: CopilotEvent, delegation: "start" | "done" | "failed"): void {
    if (streamingLineOpen) closeStreamingLine();
    const request = delegation === "start" ? state.consumeDelegationRequest(record) : undefined;
    const suffix = request?.argsPreview ? ` ${request.argsPreview}` : "";
    const name = delegatedAgentName(record);
    const message = delegation === "start" ? `start ${name}${suffix}` : delegation === "done" ? `done ${name}` : `failed ${name}`;
    ttyWriteTagged("delegate", message, {
      noisy: delegation !== "failed",
      error: delegation === "failed",
      stream: toolStream
    });
  }

  function handleToolStart(record: CopilotEvent): void {
    const name = getToolName(record);
    state.rememberDelegationRequest(record, name);
    const pending = {
      name,
      args: buildToolArgsPreview(record.data),
      argsLines: buildToolArgsVerboseLines(record.data),
      tag: state.toolTagFor(name, record)
    };
    state.rememberPendingTool(record, pending);

    if (verbose) return;
    ttyWriteTagged(pending.tag, pending.args ?? "", { noisy: true, stream: toolStream });
  }

  function handleToolComplete(record: CopilotEvent): void {
    const pending = state.consumePendingTool(record);
    const name = pending?.name ?? getToolName(record);
    const tag = pending?.tag ?? state.toolTagFor(name, record);
    const isMainAgentTool = !state.isDelegated(record);
    if (verbose) toolHandlers.writeVerboseToolBlock(record, tag, pending?.argsLines ?? [], pending?.args || buildToolArgsPreview(record.data));
    if (getToolSuccess(record) !== false) {
      if (!verbose && isMainAgentTool) {
        ttyWriteTagged(tag, "completed ✓", { noisy: true, stream: toolStream });
      }
      return;
    }
    toolHandlers.writeToolFailure(record, tag, pending?.args || buildToolArgsPreview(record.data));
  }

  function handleAssistantDelta(record: CopilotEvent): void {
    if (!interactive) return;
    const text = getDeltaText(record);
    if (!text) return;
    const tag = state.agentTagFor(record);
    if (!streamingLineOpen || streamingTag !== tag) {
      if (streamingLineOpen) closeStreamingLine();
      toolStream.write("\n" + ttyFormat("agentPrefix", { name: tag }));
      streamingLineOpen = true;
      streamingTag = tag;
    }
    toolStream.write(ttyFormat("agentToken", { text }));
  }

  return {
    handleDelegation,
    handleToolStart,
    handleToolComplete,
    handleReasoning: msgHandlers.handleReasoning,
    handleIntent: msgHandlers.handleIntent,
    handleUserMessage: msgHandlers.handleUserMessage,
    handleAssistantDelta,
    closeStreamingLine
  };
}
