import {
  approveAll,
  type PermissionRequest,
  type PermissionRequestResult,
  type ToolResultObject
} from "@github/copilot-sdk";
import { extractReturnedShellIds } from "./copilot-sdk-shell-ids.js";
import { isSubagentStartEvent, isSubagentTerminalEvent } from "./copilot-sdk-stream-event-helpers.js";
import { createSubagentState } from "./copilot-sdk-subagent-state.js";
import { describeTaskArgs, normalizeTaskArgs, readTaskAgentType } from "./copilot-sdk-task-args.js";

type ToolHookInput = {
  toolName: string;
  toolArgs: unknown;
  toolResult?: ToolResultObject;
};

export type AgentToolGuard = {
  hooks: {
    onPreToolUse: (input: ToolHookInput) =>
      | {
          permissionDecision: "allow" | "deny";
          permissionDecisionReason?: string;
          additionalContext?: string;
          modifiedArgs?: unknown;
        }
      | Promise<
          | {
              permissionDecision: "allow" | "deny";
              permissionDecisionReason?: string;
              additionalContext?: string;
              modifiedArgs?: unknown;
            }
          | undefined
        >
      | undefined;
    onPostToolUse: (input: ToolHookInput) => undefined;
  };
  onEvent: (event: unknown) => void;
  onPermissionRequest: (request: PermissionRequest, invocation: { sessionId: string }) => Promise<PermissionRequestResult> | PermissionRequestResult;
};

type GuardOptions = {
  allowedTaskAgentTypes?: Iterable<string>;
  defaultAgentExcludedTools?: Iterable<string>;
  initialAgent?: string;
  maxParallelSubagents?: number;
};

type PermissionRequestRecord = PermissionRequest & { toolName?: string };
const ALLOWED_BUILTIN_TASK_AGENTS = ["explore"];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function permissionToolName(request: PermissionRequest): string | undefined {
  const record = request as PermissionRequestRecord;
  if (typeof record.toolName === "string" && record.toolName.trim()) return record.toolName.trim();
  if (request.kind === "shell") return "bash";
  if (request.kind === "read") return "read_file";
  return undefined;
}

export function createAgentToolGuard(options: GuardOptions = {}): AgentToolGuard {
  const activeShellIds = new Set<string>();
  const configuredAgents = [...(options.allowedTaskAgentTypes ?? [])].map(normalize).filter(Boolean);
  const allowedAgents = new Set(
    configuredAgents.length > 0 ? [...ALLOWED_BUILTIN_TASK_AGENTS.map(normalize), ...configuredAgents] : []
  );
  const blockedDefaultTools = new Set([...(options.defaultAgentExcludedTools ?? [])].map(normalize).filter(Boolean));
  const subagents = createSubagentState(options.initialAgent);
  const maxParallelSubagents =
    typeof options.maxParallelSubagents === "number" && Number.isInteger(options.maxParallelSubagents) && options.maxParallelSubagents > 0
      ? options.maxParallelSubagents
      : undefined;
  let reservedSubagentLaunches = 0;
  const waitingLaunchResolvers: Array<() => void> = [];

  const currentInFlightSubagents = () => subagents.activeCount() + reservedSubagentLaunches;

  const grantWaitingLaunches = () => {
    if (!maxParallelSubagents) return;
    while (waitingLaunchResolvers.length > 0 && currentInFlightSubagents() < maxParallelSubagents) {
      reservedSubagentLaunches += 1;
      waitingLaunchResolvers.shift()?.();
    }
  };

  const denyTask = (agentType: string | undefined, taskArgs: unknown) => {
    if (allowedAgents.size === 0 || (agentType && allowedAgents.has(normalize(agentType)))) return undefined;
    const allowed = [...allowedAgents].sort().join(", ");
    return {
      permissionDecision: "deny" as const,
      permissionDecisionReason: "Only configured specialist custom agents or the explore agent may be used for this stage.",
      additionalContext: `Use one of these agent_type values: ${allowed}. Observed task args: ${describeTaskArgs(taskArgs)}.`
    };
  };

  const denyDefaultTool = (toolName: string | undefined) => {
    if (!toolName || subagents.isActive() || !blockedDefaultTools.has(normalize(toolName))) return undefined;
    return {
      permissionDecision: "deny" as const,
      permissionDecisionReason: `The default stage agent cannot call ${toolName} directly.`,
      additionalContext: `Delegate evidence inspection to a configured specialist subagent. Active subagents: ${subagents.describe()}.`
    };
  };

  const reserveLaunchSlot = (toolName: string): Promise<void> | undefined => {
    if ((toolName !== "task" && toolName !== "delegate") || !maxParallelSubagents) return undefined;
    if (currentInFlightSubagents() < maxParallelSubagents) {
      reservedSubagentLaunches += 1;
      return undefined;
    }
    return new Promise<void>((resolve) => {
      waitingLaunchResolvers.push(resolve);
    });
  };

  return {
    hooks: {
      onPreToolUse: (input) => {
        const toolName = normalize(input.toolName);
        if (toolName === "task" || toolName === "delegate") {
          const taskArgs = normalizeTaskArgs(input.toolArgs);
          const denied = denyTask(readTaskAgentType(taskArgs), taskArgs);
          if (denied) return denied;
          const complete = () => {
            if (taskArgs !== input.toolArgs) return { permissionDecision: "allow" as const, modifiedArgs: taskArgs };
            return undefined;
          };
          const waitForSlot = reserveLaunchSlot(toolName);
          if (waitForSlot) return waitForSlot.then(() => complete());
          return complete();
        }
        const denied = denyDefaultTool(input.toolName);
        if (denied) return denied;
        if (toolName !== "read_bash") return undefined;
        const shellId = readStringField(input.toolArgs, "shellId");
        if (shellId && activeShellIds.has(shellId)) return { permissionDecision: "allow" as const };
        return { permissionDecision: "deny" as const, permissionDecisionReason: "read_bash requires a real shellId returned by a previous bash call." };
      },
      onPostToolUse: (input) => {
        const toolName = normalize(input.toolName);
        if (
          (toolName === "task" || toolName === "delegate")
          && input.toolResult?.resultType === "error"
          && reservedSubagentLaunches > 0
        ) {
          reservedSubagentLaunches -= 1;
          grantWaitingLaunches();
        }
        if (toolName === "bash" && input.toolResult?.resultType === "success") {
          for (const id of extractReturnedShellIds(input.toolResult)) activeShellIds.add(id);
        }
        return undefined;
      }
    },
    onEvent: (event) => {
      subagents.onEvent(event);
      const type = ((event ?? {}) as { type?: string }).type?.toLowerCase() ?? "";
      if (isSubagentStartEvent(type) && reservedSubagentLaunches > 0) reservedSubagentLaunches -= 1;
      if (isSubagentTerminalEvent(type) || isSubagentStartEvent(type)) {
        grantWaitingLaunches();
      }
    },
    onPermissionRequest: (request, invocation) => {
      const toolName = permissionToolName(request);
      const denied = denyDefaultTool(toolName);
      if (denied) return { kind: "reject", feedback: denied.permissionDecisionReason };
      return approveAll(request, invocation);
    }
  };
}
