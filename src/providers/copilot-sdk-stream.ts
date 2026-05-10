import { createTtyStatus } from "../shared/tty-progress.js";
import { ttyFormat, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildToolArgsPreview, buildToolCallId, buildToolErrorPreview } from "./copilot-sdk-stream-format.js";

function isEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

type CopilotEvent = {
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

export function createDreamAgentStreamHandler(): ((event: unknown) => void) | undefined {
  const enabled = isEnabled(process.env.DREAM_RUN_LIVE_STREAM ?? process.env.DREAM_EVAL_LIVE_STREAM);
  if (!enabled) return undefined;

  let streamingLineOpen = false;
  const interactive = Boolean(process.stderr.isTTY && process.env.CI !== "true");
  const toolStatus = createTtyStatus("tool", { noisy: true, noPrefix: true });
  const pendingById = new Map<string, { name: string }>();
  const pendingUnnamed: Array<{ name: string }> = [];
  function renderToolState(message: string): void {
    if (!interactive) return;
    toolStatus.update(message);
  }

  return (event: unknown) => {
    const record = (event ?? {}) as CopilotEvent;
    const type = record.type ?? "";

    if (isToolStart(type)) {
      const name = getToolName(record);
      const argsPreview = buildToolArgsPreview(record.data);
      const id = buildToolCallId(record.data);
      if (id) pendingById.set(id, { name });
      else pendingUnnamed.push({ name });
      const text = argsPreview ?? "";
      if (interactive) renderToolState(`[${name}] ${text}`);
      else ttyWriteTagged(name, text, { noisy: true });
      return;
    }

    if (isToolComplete(type)) {
      const id = buildToolCallId(record.data);
      const pending = id ? pendingById.get(id) : pendingUnnamed.shift();
      if (id) pendingById.delete(id);
      const name = pending?.name ?? getToolName(record);
      const success = getToolSuccess(record);
      if (success !== false) return;
      const err = buildToolErrorPreview(record.data);
      const text = err ? `failed ✗ ${err}` : "failed ✗";
      if (interactive) renderToolState(`[${name}] ${text}`);
      else ttyWriteTagged(name, text, { noisy: true });
      return;
    }

    if (type === "assistant.message_delta" || type === "assistant.streaming_delta") {
      const text = getDeltaText(record);
      if (!text) return;
      if (!streamingLineOpen) {
        process.stdout.write("\n" + ttyFormat("agentPrefix"));
        streamingLineOpen = true;
      }
      process.stdout.write(ttyFormat("agentToken", { text }));
      return;
    }

    if (type === "assistant.message" && streamingLineOpen) {
      process.stdout.write("\n");
      streamingLineOpen = false;
    }
  };
}
