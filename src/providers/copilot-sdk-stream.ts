import { createTtyStatus } from "../shared/tty-progress.js";
import { ttyFormat, ttyFormatTagged, ttyWriteContinuation, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildToolArgsPreview, buildToolCallId, buildToolErrorPreview } from "./copilot-sdk-stream-format.js";
import {
  buildAssistantIntentLines,
  buildReasoningVerboseLines,
  buildToolArgsVerboseLines,
  buildToolResultVerboseLines
} from "./copilot-sdk-stream-verbose-format.js";
function isEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function resolveVerboseDefault(explicit: boolean | undefined): boolean {
  if (typeof explicit === "boolean") return explicit;
  const raw = process.env.DREAM_STREAM_VERBOSE ?? process.env.DREAM_AGENT_LOG_VERBOSE;
  if (raw === undefined) return true;
  const value = raw.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  return true;
}
type CopilotEvent = {
  agentId?: string;
  id?: string;
  parentId?: string | null;
  type?: string;
  data?: Record<string, unknown> & {
    deltaContent?: unknown;
    content?: unknown;
    toolName?: unknown;
    success?: unknown;
    tool?: { name?: unknown };
    invocation?: { toolName?: unknown };
  };
};
function getDeltaText(record: CopilotEvent): string {
  const primary = record.data?.deltaContent;
  if (typeof primary === "string") return primary;
  const fallback = record.data?.content;
  return typeof fallback === "string" ? fallback : "";
}

function getUserMessageText(record: CopilotEvent): string {
  const content = record.data?.content;
  if (typeof content === "string" && content.trim().length > 0) return content;
  return "";
}
function getToolName(record: CopilotEvent): string {
  const direct = record.data?.toolName;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nestedTool = (record.data?.tool as { name?: unknown } | undefined)?.name;
  if (typeof nestedTool === "string" && nestedTool.trim()) return nestedTool;
  const invocation = (record.data?.invocation as { toolName?: unknown } | undefined)?.toolName;
  if (typeof invocation === "string" && invocation.trim()) return invocation;
  const generic = record.data?.name;
  if (typeof generic === "string" && generic.trim()) return generic;
  return "unknown-tool";
}
function isToolStart(type: string): boolean {
  return type === "tool.execution_start" || /tool\..*(start|begin|created)$/i.test(type);
}
function isToolComplete(type: string): boolean {
  return type === "tool.execution_complete" || /tool\..*(complete|finish|done|end)$/i.test(type);
}
function getToolSuccess(record: CopilotEvent): boolean | undefined {
  if (record.data?.success === true) return true;
  if (record.data?.success === false) return false;
  const status = record.data?.status;
  if (typeof status === "string") {
    const value = status.toLowerCase();
    if (value.includes("ok") || value.includes("success")) return true;
    if (value.includes("fail") || value.includes("error")) return false;
  }
  return undefined;
}

function hasReasoningPayload(record: CopilotEvent): boolean {
  const data = record.data ?? {};
  return Boolean(data.reasoningText || data.reasoning || data.reasoningDelta || data.thinking || data.thought);
}

function delegationPhase(type: string): "start" | "done" | "failed" | undefined {
  const value = type.toLowerCase();
  if (!value.includes("subagent") && !value.includes("delegat")) return undefined;
  if (value.includes("start") || value.includes("begin") || value.includes("created")) return "start";
  if (value.includes("fail") || value.includes("error")) return "failed";
  if (value.includes("done") || value.includes("complete") || value.includes("finish") || value.includes("success")) return "done";
  return undefined;
}

function delegatedAgentName(record: CopilotEvent): string {
  const data = record.data ?? {};
  const candidates: unknown[] = [
    data.agentName,
    data.subagentName,
    data.targetAgent,
    data.agent,
    data.name,
    (data.subagent as Record<string, unknown> | undefined)?.name,
    (data.agent as Record<string, unknown> | undefined)?.name
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "unknown-subagent";
}

function eventSubagentName(record: CopilotEvent): string | undefined {
  const data = record.data ?? {};
  const candidates: unknown[] = [
    data.agentName,
    data.subagentName,
    data.targetAgent,
    (data.subagent as Record<string, unknown> | undefined)?.name,
    (data.agent as Record<string, unknown> | undefined)?.name
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

type DelegationRequest = {
  argsPreview: string;
};

export function createDreamAgentStreamHandler(options: { agentTag?: string; verbose?: boolean } = {}): ((event: unknown) => void) | undefined {
  const enabled = isEnabled(process.env.DREAM_RUN_LIVE_STREAM ?? process.env.DREAM_EVAL_LIVE_STREAM);
  if (!enabled) return undefined;
  const agentTag = options.agentTag?.trim() || "dream agent";
  const verbose = resolveVerboseDefault(options.verbose);
  let streamingLineOpen = false;
  let streamingTag: string | undefined;
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  const toolStream = interactive ? process.stderr : process.stdout;
  const toolStatus = createTtyStatus("tool", { noisy: true, noPrefix: true });
  const pendingById = new Map<string, { name: string; args: string; argsLines: string[]; tag: string }>();
  const pendingUnnamed: Array<{ name: string; args: string; argsLines: string[]; tag: string }> = [];
  const pendingDelegationsById = new Map<string, DelegationRequest>();
  const pendingDelegations: DelegationRequest[] = [];
  const agentIdToName = new Map<string, string>();

  function delegatedSuffix(record: CopilotEvent): string | undefined {
    const delegated = eventSubagentName(record);
    if (delegated?.trim()) return delegated.trim();
    const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
    if (!agentId) return undefined;
    return agentIdToName.get(agentId);
  }

  function agentTagFor(record: CopilotEvent): string {
    const delegated = delegatedSuffix(record);
    return delegated ? `${agentTag}@${delegated}` : agentTag;
  }

  function toolTagFor(toolName: string, record: CopilotEvent): string {
    const delegated = delegatedSuffix(record);
    return delegated ? `${toolName}@${delegated}` : toolName;
  }

  function delegationRequestId(record: CopilotEvent): string | undefined {
    const eventId = typeof record.id === "string" ? record.id.trim() : "";
    if (eventId) return eventId;
    return buildToolCallId(record.data);
  }

  function rememberDelegationRequest(record: CopilotEvent): void {
    const name = getToolName(record);
    if (name !== "task" && name !== "delegate") return;
    const argsPreview = buildToolArgsPreview(record.data);
    if (!argsPreview) return;
    const request = { argsPreview };
    const requestId = delegationRequestId(record);
    if (requestId) pendingDelegationsById.set(requestId, request);
    else pendingDelegations.push(request);
  }

  function consumeDelegationRequest(record: CopilotEvent): DelegationRequest | undefined {
    const requestId = typeof record.parentId === "string" && record.parentId.trim() ? record.parentId.trim() : buildToolCallId(record.data);
    if (requestId) {
      const request = pendingDelegationsById.get(requestId);
      if (request) {
        pendingDelegationsById.delete(requestId);
        return request;
      }
    }
    return pendingDelegations.shift();
  }

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (type.startsWith("subagent.")) {
      const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
      const name = delegatedAgentName(record);
      if (agentId && name !== "unknown-subagent") agentIdToName.set(agentId, name);
    }

    const delegation = delegationPhase(type);
    if (delegation) {
      if (streamingLineOpen) {
        process.stdout.write("\n");
        streamingLineOpen = false;
      }
      const name = delegatedAgentName(record);
      const request = delegation === "start" ? consumeDelegationRequest(record) : undefined;
      const suffix = request?.argsPreview ? ` ${request.argsPreview}` : "";
      const message = delegation === "start" ? `start ${name}${suffix}` : delegation === "done" ? `done ${name}` : `failed ${name}`;
      ttyWriteTagged("delegate", message, { noisy: delegation !== "failed", error: delegation === "failed" });
      return;
    }

    if (isToolStart(type)) {
      rememberDelegationRequest(record);
      const name = getToolName(record);
      const tag = toolTagFor(name, record);
      const argsPreview = buildToolArgsPreview(record.data);
      const argsVerbose = buildToolArgsVerboseLines(record.data);
      const id = buildToolCallId(record.data);
      if (id) pendingById.set(id, { name, args: argsPreview, argsLines: argsVerbose, tag });
      else pendingUnnamed.push({ name, args: argsPreview, argsLines: argsVerbose, tag });
      const text = argsPreview ?? "";
      if (verbose) {
        // Verbose mode renders a single consolidated block on completion.
      } else if (interactive) toolStatus.update(ttyFormatTagged(tag, text, { noisy: true }));
      else ttyWriteTagged(tag, text, { noisy: true });
      return;
    }

    if (isToolComplete(type)) {
      const id = buildToolCallId(record.data);
      const pending = id ? pendingById.get(id) : pendingUnnamed.shift();
      if (id) pendingById.delete(id);
      const name = pending?.name ?? getToolName(record);
      const tag = pending?.tag ?? toolTagFor(name, record);
      const success = getToolSuccess(record);
      const resultLines = verbose ? buildToolResultVerboseLines(record.data) : [];
      if (verbose) {
        const argsLines = pending?.argsLines ?? [];
        const argsPreview = pending?.args || buildToolArgsPreview(record.data);
        if (streamingLineOpen) {
          process.stdout.write("\n");
          streamingLineOpen = false;
          streamingTag = undefined;
        }
        if (interactive) process.stderr.write("\n");
        if (argsLines.length > 0) {
          ttyWriteTagged(tag, argsLines[0] ?? "", { noisy: true, stream: toolStream });
          for (const line of argsLines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
        } else if (argsPreview) {
          ttyWriteTagged(tag, argsPreview, { noisy: true, stream: toolStream });
        } else {
          ttyWriteTagged(tag, "", { noisy: true, stream: toolStream });
        }
        if (resultLines.length > 0) {
          ttyWriteContinuation("result:", { noisy: true, indent: 2, stream: toolStream });
          for (const line of resultLines) ttyWriteContinuation(line, { noisy: true, indent: 4, stream: toolStream });
        }
      }
      if (success !== false) return;
      const err = buildToolErrorPreview(record.data);
      const args = pending?.args || buildToolArgsPreview(record.data);
      const failure = err ? `failed ✗ ${err}` : "failed ✗";
      if (interactive) {
        process.stderr.write("\n");
        if (args && !verbose) ttyWriteTagged(tag, args, { noisy: true, stream: process.stderr });
        ttyWriteTagged(tag, failure, { error: true, stream: process.stderr });
      } else {
        if (args && !verbose) ttyWriteTagged(tag, args, { noisy: true });
        ttyWriteTagged(tag, failure, { error: true });
      }
      return;
    }

    if (verbose && (type.includes("reasoning") || hasReasoningPayload(record))) {
      const lines = buildReasoningVerboseLines(record.data);
      if (lines.length > 0) {
        if (streamingLineOpen) {
          process.stdout.write("\n");
          streamingLineOpen = false;
          streamingTag = undefined;
        }
        const tag = agentTagFor(record);
        ttyWriteTagged(tag, "reasoning:", { noisy: true });
        for (const line of lines) ttyWriteContinuation(line, { noisy: true, indent: 4 });
      }
      if (type.includes("reasoning")) return;
    }

    if (verbose && type === "assistant.message" && !hasReasoningPayload(record)) {
      const intentLines = buildAssistantIntentLines(record.data);
      if (intentLines.length > 0) {
        if (streamingLineOpen) {
          process.stdout.write("\n");
          streamingLineOpen = false;
          streamingTag = undefined;
        }
        const tag = agentTagFor(record);
        ttyWriteTagged(tag, "intent:", { noisy: true });
        for (const line of intentLines) ttyWriteContinuation(line, { noisy: true, indent: 4 });
      }
    }

    if (verbose && type === "user.message") {
      const text = getUserMessageText(record);
      if (text) {
        if (streamingLineOpen) {
          process.stdout.write("\n");
          streamingLineOpen = false;
          streamingTag = undefined;
        }
        const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 0);
        if (lines.length > 0) {
          ttyWriteTagged("user", lines[0], { noisy: true });
          for (const line of lines.slice(1)) ttyWriteContinuation(line, { noisy: true, indent: 2 });
        }
      }
      return;
    }

    if (type === "assistant.message_delta" || type === "assistant.streaming_delta") {
      const text = getDeltaText(record);
      if (!text) return;
      const tag = agentTagFor(record);
      if (!streamingLineOpen || streamingTag !== tag) {
        if (streamingLineOpen) process.stdout.write("\n");
        process.stdout.write("\n" + ttyFormat("agentPrefix", { name: tag }));
        streamingLineOpen = true;
        streamingTag = tag;
      }
      process.stdout.write(ttyFormat("agentToken", { text }));
      return;
    }

    if (type === "assistant.message" && streamingLineOpen) {
      process.stdout.write("\n");
      streamingLineOpen = false;
      streamingTag = undefined;
    }
  };
}
