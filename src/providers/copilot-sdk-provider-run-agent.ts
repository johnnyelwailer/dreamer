import { CopilotClient } from "@github/copilot-sdk";
import type { RunAgentOptions } from "../core/contracts.js";
import type { CopilotSdkProviderOptions } from "./copilot-sdk-provider.js";
import { createAgentToolGuard } from "./copilot-sdk-agent-tool-guard.js";
import { createDreamAgentStreamHandler } from "./copilot-sdk-stream.js";
import { buildToolCallId } from "./copilot-sdk-stream-format.js";
import { buildProviderSessionConfig } from "./copilot-sdk-provider-session-config.js";
import { COPILOT_SDK_PROVIDER_REQUEST_FAILED, extractAssistantText } from "./copilot-sdk-text.js";

const KNOWN_BUILTIN_TOOL_NAMES = [
  "bash",
  "create",
  "edit",
  "glob",
  "grep",
  "file_search",
  "grep_search",
  "semantic_search",
  "list_dir",
  "read_file",
  "list_agents",
  "list_bash",
  "read_agent",
  "read_bash",
  "manage_todo_list",
  "get_errors",
  "report_intent",
  "skill",
  "task",
  "delegate",
  "view",
  "web_fetch",
  "write_bash"
] as const;

function collectKnownToolNames(tools: unknown[]): Set<string> {
  const knownToolNames = new Set(
    tools
      .map((tool) => (tool as { name?: unknown }).name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      .map((name) => name.trim())
  );
  for (const builtinName of KNOWN_BUILTIN_TOOL_NAMES) knownToolNames.add(builtinName);
  return knownToolNames;
}

function sanitizeToolList(toolNames: Iterable<string> | undefined, knownToolNames: Set<string>): string[] | undefined {
  if (!toolNames) return undefined;
  const filtered = [...toolNames].filter((toolName) => {
    const normalized = toolName.trim();
    return normalized.length > 0 && knownToolNames.has(normalized);
  });
  return filtered.length > 0 ? filtered : undefined;
}

function resolveDefaultAgentExcludedTools(
  defaultAgent: RunAgentOptions["defaultAgent"],
  knownToolNames: Set<string>
): string[] | undefined {
  const sanitizedExcluded = sanitizeToolList(defaultAgent?.excludedTools, knownToolNames);
  const sanitizedAllowed = sanitizeToolList(defaultAgent?.allowedTools, knownToolNames);
  if (sanitizedAllowed && sanitizedAllowed.length > 0) {
    const allowedSet = new Set(sanitizedAllowed);
    const derivedExcluded = [...knownToolNames].filter((toolName) => !allowedSet.has(toolName));
    const merged = [...new Set([...(sanitizedExcluded ?? []), ...derivedExcluded])];
    return merged;
  }
  return sanitizedExcluded;
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
  const knownToolNames = collectKnownToolNames(tools);
  const sanitizedDefaultAgentAllowedTools = sanitizeToolList(runOptions.defaultAgent?.allowedTools, knownToolNames);
  const sanitizedDefaultAgentExcludedTools = resolveDefaultAgentExcludedTools(runOptions.defaultAgent, knownToolNames);
  const guard = createAgentToolGuard({
    allowedTaskAgentTypes: runOptions.customAgents?.map((agent) => agent.name),
    defaultAgentAllowedTools: sanitizedDefaultAgentAllowedTools,
    defaultAgentExcludedTools: sanitizedDefaultAgentExcludedTools,
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
            defaultAgent: {
              excludedTools: sanitizedDefaultAgentExcludedTools ?? []
            }
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
    const raw = String(error);
    const baseUrl = options.sessionConfig.provider?.baseUrl;
    const tlsHint =
      baseUrl && raw.includes("Connection error")
        ? ` Hint: connection to ${baseUrl} failed in SDK transport. If this host uses an internal/self-signed CA, configure NODE_EXTRA_CA_CERTS (preferred) or NODE_TLS_REJECT_UNAUTHORIZED=0 (insecure, temporary).`
        : "";
    return `${COPILOT_SDK_PROVIDER_REQUEST_FAILED}: ${raw}${tlsHint}`;
  } finally {
    await client.stop().catch(() => undefined);
  }
}