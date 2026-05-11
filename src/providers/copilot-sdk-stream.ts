import { createDreamAgentInkStreamHandler } from "./copilot-sdk-stream-ink.js";
import {
  delegationPhase,
  hasReasoningPayload,
  isEnabled,
  isToolComplete,
  isToolStart,
  resolveVerboseDefault,
  type CopilotEvent
} from "./copilot-sdk-stream-event-helpers.js";
import { createStreamState } from "./copilot-sdk-stream-state.js";
import { createTtyStreamHandlers } from "./copilot-sdk-stream-tty-handlers.js";

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
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  const toolStream = interactive ? process.stderr : process.stdout;
  const state = createStreamState(agentTag);
  const handlers = createTtyStreamHandlers(interactive, verbose, toolStream, state);

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (type.startsWith("subagent.")) state.rememberSubagent(record);

    const delegation = delegationPhase(type);
    if (delegation) return handlers.handleDelegation(record, delegation);
    if (isToolStart(type)) return handlers.handleToolStart(record);
    if (isToolComplete(type)) return handlers.handleToolComplete(record);

    if (verbose && (type.includes("reasoning") || hasReasoningPayload(record))) {
      handlers.handleReasoning(record);
      if (type.includes("reasoning")) return;
    }

    if (verbose && type === "assistant.message" && !hasReasoningPayload(record)) handlers.handleIntent(record);
    if (verbose && type === "user.message") return handlers.handleUserMessage(record);
    if (type === "assistant.message_delta" || type === "assistant.streaming_delta") return handlers.handleAssistantDelta(record);
  };
}
