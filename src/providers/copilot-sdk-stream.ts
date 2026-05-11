import { ttyFormat, ttyWriteContinuation, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildToolArgsPreview, buildToolErrorPreview } from "./copilot-sdk-stream-format.js";
import { createDreamAgentInkStreamHandler } from "./copilot-sdk-stream-ink.js";
import {
  delegationPhase,
  delegatedAgentName,
  getDeltaText,
  getToolName,
  getToolSuccess,
  getUserMessageText,
  hasReasoningPayload,
  isEnabled,
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

export function createDreamAgentStreamHandler(options: { agentTag?: string; verbose?: boolean } = {}): ((event: unknown) => void) | undefined {
  const enabled = isEnabled(process.env.DREAM_RUN_LIVE_STREAM ?? process.env.DREAM_EVAL_LIVE_STREAM);
  if (!enabled) return undefined;

  const renderer = (process.env.DREAM_STREAM_RENDERER ?? "ink").trim().toLowerCase();
  if (renderer === "ink") {
    const inkHandler = createDreamAgentInkStreamHandler(options);
    if (inkHandler) return inkHandler;
  }

  const agentTag = options.agentTag?.trim() || "dream agent";
  const verbose = resolveVerboseDefault(options.verbose);
  let streamingLineOpen = false;
  let streamingTag: string | undefined;
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  const toolStream = interactive ? process.stderr : process.stdout;
  const state = createStreamState(agentTag);

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (type.startsWith("subagent.")) state.rememberSubagent(record);

    const delegation = delegationPhase(type);
    if (delegation) return handleDelegation(record, delegation);
    if (isToolStart(type)) return handleToolStart(record);
    if (isToolComplete(type)) return handleToolComplete(record);

    if (verbose && (type.includes("reasoning") || hasReasoningPayload(record))) {
      handleReasoning(record);
      if (type.includes("reasoning")) return;
    }

    if (verbose && type === "assistant.message" && !hasReasoningPayload(record)) handleIntent(record);
    if (verbose && type === "user.message") return handleUserMessage(record);
    if (type === "assistant.message_delta" || type === "assistant.streaming_delta") return handleAssistantDelta(record);
    if (type === "assistant.message" && streamingLineOpen) closeStreamingLine();
  };

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
    const isMainAgentTool = !tag.includes("@");
    if (verbose) writeVerboseToolBlock(record, tag, pending?.argsLines ?? [], pending?.args || buildToolArgsPreview(record.data));
    if (getToolSuccess(record) !== false) {
      if (!verbose && isMainAgentTool) {
        ttyWriteTagged(tag, "completed ✓", { noisy: true, stream: toolStream });
      }
      return;
    }
    writeToolFailure(record, tag, pending?.args || buildToolArgsPreview(record.data));
  }

  function writeVerboseToolBlock(record: CopilotEvent, tag: string, argsLines: string[], argsPreview: string): void {
    const resultLines = buildToolResultVerboseLines(record.data);
    if (streamingLineOpen) closeStreamingLine();
    if (interactive) toolStream.write("\n");

    if (argsLines.length > 0) {
      ttyWriteTagged(tag, argsLines[0] ?? "", { noisy: true, stream: toolStream });
      for (const line of argsLines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
    } else {
      ttyWriteTagged(tag, argsPreview ?? "", { noisy: true, stream: toolStream });
    }

    if (resultLines.length === 0) return;
    ttyWriteContinuation("result:", { noisy: true, indent: 2, stream: toolStream });
    for (const line of resultLines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function writeToolFailure(record: CopilotEvent, tag: string, args: string): void {
    const preview = buildToolErrorPreview(record.data);
    const failure = preview ? `failed ✗ ${preview}` : "failed ✗";
    if (interactive) toolStream.write("\n");
    if (args && !verbose) ttyWriteTagged(tag, args, { noisy: true, stream: toolStream });
    ttyWriteTagged(tag, failure, { error: true, stream: toolStream });
  }

  function handleReasoning(record: CopilotEvent): void {
    const lines = buildReasoningVerboseLines(record.data);
    if (lines.length === 0) return;
    if (streamingLineOpen) closeStreamingLine();
    ttyWriteTagged(state.agentTagFor(record), "reasoning:", { noisy: true, stream: toolStream });
    for (const line of lines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function handleIntent(record: CopilotEvent): void {
    const lines = buildAssistantIntentLines(record.data);
    if (lines.length === 0) return;
    if (streamingLineOpen) closeStreamingLine();
    ttyWriteTagged(state.agentTagFor(record), "intent:", { noisy: true, stream: toolStream });
    for (const line of lines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
  }

  function handleUserMessage(record: CopilotEvent): void {
    const text = getUserMessageText(record);
    if (!text) return;
    if (streamingLineOpen) closeStreamingLine();
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    ttyWriteTagged("user", lines[0], { noisy: true, stream: toolStream });
    for (const line of lines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 2, stream: toolStream });
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
}
