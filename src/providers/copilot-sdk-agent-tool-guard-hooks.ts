import { approveAll, type PermissionRequest, type PermissionRequestResult, type ToolResultObject } from "@github/copilot-sdk";
import { extractReturnedShellIds } from "./copilot-sdk-shell-ids.js";
import { isSubagentStartEvent, isSubagentTerminalEvent } from "./copilot-sdk-stream-event-helpers.js";
import { describeTaskArgs, normalizeTaskArgs, readTaskAgentType } from "./copilot-sdk-task-args.js";
import { normalizeValue, permissionToolName, readStringField } from "./copilot-sdk-agent-tool-guard-helpers.js";
import { createGuardPolicy } from "./copilot-sdk-agent-tool-guard-policy.js";

type ToolHookInput = { toolName: string; toolArgs: unknown; toolResult?: ToolResultObject };
type GuardOptions = { allowedTaskAgentTypes?: Iterable<string>; defaultAgentExcludedTools?: Iterable<string>; maxParallelSubagents?: number };
type SubagentState = { activeCount: () => number; isActive: () => boolean; describe: () => string };

export function createAgentToolGuardHooks(options: GuardOptions, subagents: SubagentState, activeShellIds: Set<string>) {
  const policy = createGuardPolicy(options, subagents);
  return {
    hooks: {
      onPreToolUse: (input: ToolHookInput) => {
        const toolName = normalizeValue(input.toolName);
        if (toolName === "task" || toolName === "delegate") {
          const taskArgs = normalizeTaskArgs(input.toolArgs);
          const denied = policy.denyTask(readTaskAgentType(taskArgs), taskArgs);
          if (denied) return denied;
          const complete = () => (taskArgs !== input.toolArgs ? { permissionDecision: "allow" as const, modifiedArgs: taskArgs } : undefined);
          const waitForSlot = policy.reserveLaunchSlot(toolName);
          if (waitForSlot) return waitForSlot.then(() => complete());
          return complete();
        }
        const denied = policy.denyDefaultTool(input.toolName);
        if (denied) return denied;
        if (toolName !== "read_bash") return undefined;
        const shellId = readStringField(input.toolArgs, "shellId");
        if (shellId && activeShellIds.has(shellId)) return { permissionDecision: "allow" as const };
        return { permissionDecision: "deny" as const, permissionDecisionReason: "read_bash requires a real shellId returned by a previous bash call." };
      },
      onPostToolUse: (input: ToolHookInput) => {
        const toolName = normalizeValue(input.toolName);
        if ((toolName === "task" || toolName === "delegate") && input.toolResult?.resultType === "error" && policy.reservedSubagentLaunches() > 0) {
          policy.releaseReservedLaunch();
        }
        if (toolName === "bash" && input.toolResult?.resultType === "success") {
          for (const id of extractReturnedShellIds(input.toolResult)) activeShellIds.add(id);
        }
        return undefined;
      }
    },
    onEvent: (event: unknown) => {
      subagents.onEvent(event);
      const type = ((event ?? {}) as { type?: string }).type?.toLowerCase() ?? "";
      if (isSubagentStartEvent(type)) policy.onSubagentStart();
      if (isSubagentTerminalEvent(type) || isSubagentStartEvent(type)) policy.grantWaitingLaunches();
    },
    onPermissionRequest: (request: PermissionRequest, invocation: { sessionId: string }): Promise<PermissionRequestResult> | PermissionRequestResult => {
      const toolName = permissionToolName(request);
      const denied = policy.denyDefaultTool(toolName);
      if (denied) return { kind: "reject", feedback: denied.permissionDecisionReason };
      return approveAll(request, invocation);
    }
  };
}