import { CopilotClient } from "@github/copilot-sdk";
import type { RunAgentOptions } from "../core/contracts.js";
import type { CopilotSdkProviderOptions } from "./copilot-sdk-provider.js";
import { createAgentToolGuard } from "./copilot-sdk-agent-tool-guard.js";
import { createDreamAgentStreamHandler } from "./copilot-sdk-stream.js";
import { buildToolCallId } from "./copilot-sdk-stream-format.js";
import { buildProviderSessionConfig } from "./copilot-sdk-provider-session-config.js";
import { COPILOT_SDK_PROVIDER_REQUEST_FAILED, extractAssistantText } from "./copilot-sdk-text.js";

function sanitizeDefaultAgentExcludedTools(excludedTools: Iterable<string> | undefined, tools: unknown[]): string[] | undefined {
  if (!excludedTools) return undefined;
  const knownToolNames = new Set(
    tools
      .map((tool) => (tool as { name?: unknown }).name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
  const filtered = [...excludedTools].filter((toolName) => {
    const normalized = toolName.trim();
    return normalized.length > 0 && (knownToolNames.has(normalized) || normalized === "bash" || normalized === "create" || normalized === "edit" || normalized === "glob" || normalized === "grep" || normalized === "list_agents" || normalized === "list_bash" || normalized === "read_agent" || normalized === "read_bash" || normalized === "report_intent" || normalized === "skill" || normalized === "task" || normalized === "view" || normalized === "web_fetch" || normalized === "write_bash");
  });
  return filtered.length > 0 ? filtered : undefined;
}

function createSessionActivityTracker() {
  const activeToolIds = new Set<string>();
  const activeSubagentIds = new Set<string>();
  let activeAnonymousTools = 0;
  let activeAnonymousSubagents = 0;
  const isIdle = () => activeToolIds.size === 0 && activeSubagentIds.size === 0 && activeAnonymousTools === 0 && activeAnonymousSubagents === 0;
  const subagentId = (event: unknown): string | undefined => {
    const record = (event ?? {}) as { agentId?: unknown; data?: Record<string, unknown> };
    if (typeof record.agentId === "string" && record.agentId.trim()) return record.agentId.trim();
    const nested = record.data?.agentId;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    return undefined;
  };
  const onEvent = (event: unknown): void => {
    const record = (event ?? {}) as { type?: string; data?: Record<string, unknown> };
    const type = record.type?.toLowerCase() ?? "";
    if (type.includes("tool.start")) {
      const id = buildToolCallId(record.data);
      if (id) activeToolIds.add(id);
      else activeAnonymousTools += 1;
    }
    if (type.includes("tool.complete")) {
      const id = buildToolCallId(record.data);
      if (id) activeToolIds.delete(id);
      else activeAnonymousTools = Math.max(0, activeAnonymousTools - 1);
    }
    if (type.startsWith("subagent.start")) {
      const id = subagentId(event);
      if (id) activeSubagentIds.add(id);
      else activeAnonymousSubagents += 1;
    }
    if (type.startsWith("subagent.end") || type.startsWith("subagent.complete") || type.startsWith("subagent.fail")) {
      const id = subagentId(event);
      if (id) activeSubagentIds.delete(id);
      else activeAnonymousSubagents = Math.max(0, activeAnonymousSubagents - 1);
    }
  };
  const waitForIdle = async (timeoutMs: number): Promise<void> => {
    if (isIdle()) return;
    const startedAt = Date.now();
    while (!isIdle()) {
      if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for active tool/subagent activity to finish before retry.");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  return { onEvent, waitForIdle };
}

export async function runCopilotSdkAgent(options: CopilotSdkProviderOptions, prompt: string, tools: unknown[], runOptions: RunAgentOptions = {}): Promise<string> {
  const client = new CopilotClient(options.clientOptions);
  const onStreamEvent = createDreamAgentStreamHandler({ agentTag: runOptions.selectedAgent ?? runOptions.streamTag ?? "dream agent" });
  const activityTracker = createSessionActivityTracker();
  const sanitizedDefaultAgentExcludedTools = sanitizeDefaultAgentExcludedTools(runOptions.defaultAgent?.excludedTools, tools);
  const guard = createAgentToolGuard({
    allowedTaskAgentTypes: runOptions.customAgents?.map((agent) => agent.name),
    defaultAgentExcludedTools: runOptions.defaultAgent?.excludedTools,
    initialAgent: runOptions.selectedAgent,
    maxParallelSubagents: runOptions.maxSubagentParallelism ?? options.maxSubagentParallelism
  });

  try {
    await client.start();
    const baseSessionConfig = buildProviderSessionConfig(options, runOptions.workingDirectory);
    const customAgents = runOptions.customAgents as Parameters<typeof client.createSession>[0]["customAgents"] | undefined;
    const toolDefinitions = tools as Parameters<typeof client.createSession>[0]["tools"];
    const session = await client.createSession({
      ...baseSessionConfig,
      ...(customAgents ? { customAgents } : {}),
      ...(runOptions.defaultAgent
        ? {
            defaultAgent: sanitizedDefaultAgentExcludedTools
              ? { ...runOptions.defaultAgent, excludedTools: sanitizedDefaultAgentExcludedTools }
              : { ...runOptions.defaultAgent, excludedTools: [] }
          }
        : {}),
      ...(runOptions.selectedAgent ? { agent: runOptions.selectedAgent } : {}),
      onPermissionRequest: guard.onPermissionRequest,
      hooks: guard.hooks,
      onEvent: (event) => {
        activityTracker.onEvent(event);
        guard.onEvent(event);
        try { onStreamEvent?.(event); } catch {}
        try { runOptions.onSubagentEvent?.(event); } catch {}
      },
      ...(toolDefinitions.length > 0 ? { tools: toolDefinitions } : {})
    });

    let lastOutput = extractAssistantText(await session.sendAndWait({ prompt }, options.requestTimeoutMs));
    await activityTracker.waitForIdle(options.requestTimeoutMs);
    const retries = runOptions.retries ?? [];
    for (const [retryIndex, retryPrompt] of retries.entries()) {
      const shouldRetry = await runOptions.shouldRetry?.({ retryPrompt, retryIndex, lastOutput });
      if (shouldRetry === false) break;
      lastOutput = extractAssistantText(await session.sendAndWait({ prompt: retryPrompt }, options.requestTimeoutMs));
      await activityTracker.waitForIdle(options.requestTimeoutMs);
    }
    return lastOutput;
  } catch (error) {
    return `${COPILOT_SDK_PROVIDER_REQUEST_FAILED}: ${String(error)}`;
  } finally {
    await client.stop().catch(() => undefined);
  }
}