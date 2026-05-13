import type { PermissionRequest } from "@github/copilot-sdk";
import { describeTaskArgs } from "./copilot-sdk-task-args.js";
import { normalizeValue } from "./copilot-sdk-agent-tool-guard-helpers.js";

type SubagentState = { activeCount: () => number; isActive: () => boolean; describe: () => string };
type GuardOptions = {
  allowedTaskAgentTypes?: Iterable<string>;
  defaultAgentAllowedTools?: Iterable<string>;
  defaultAgentExcludedTools?: Iterable<string>;
  maxParallelSubagents?: number;
};

const ALLOWED_BUILTIN_TASK_AGENTS = ["explore"];

export function createGuardPolicy(options: GuardOptions, subagents: SubagentState) {
  const configuredAgents = [...(options.allowedTaskAgentTypes ?? [])].map(normalizeValue).filter(Boolean);
  const allowedAgents = new Set(configuredAgents.length > 0 ? [...ALLOWED_BUILTIN_TASK_AGENTS.map(normalizeValue), ...configuredAgents] : []);
  const allowedDefaultTools = new Set([...(options.defaultAgentAllowedTools ?? [])].map(normalizeValue).filter(Boolean));
  const blockedDefaultTools = new Set([...(options.defaultAgentExcludedTools ?? [])].map(normalizeValue).filter(Boolean));
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
    if (allowedAgents.size === 0 || (agentType && allowedAgents.has(normalizeValue(agentType)))) return undefined;
    const allowed = [...allowedAgents].sort().join(", ");
    return { permissionDecision: "deny" as const, permissionDecisionReason: "Only configured specialist custom agents or the explore agent may be used for this stage.", additionalContext: `Use one of these agent_type values: ${allowed}. Observed task args: ${describeTaskArgs(taskArgs)}.` };
  };

  const denyDefaultTool = (toolName: string | undefined) => {
    if (!toolName || subagents.isActive()) return undefined;
    const normalizedToolName = normalizeValue(toolName);
    const allowlistEnabled = allowedDefaultTools.size > 0;
    const deniedByAllowlist = allowlistEnabled && !allowedDefaultTools.has(normalizedToolName);
    const deniedByExclusion = blockedDefaultTools.has(normalizedToolName);
    if (!deniedByAllowlist && !deniedByExclusion) return undefined;
    return {
      permissionDecision: "deny" as const,
      permissionDecisionReason: `The default stage agent cannot call ${toolName} directly.`,
      additionalContext:
        `Use task delegation with agent_type=\"explore\" when file evidence is needed, or delegate to a configured specialist. Active subagents: ${subagents.describe()}.`
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
    denyTask,
    denyDefaultTool,
    reserveLaunchSlot,
    grantWaitingLaunches,
    releaseReservedLaunch: () => {
      if (reservedSubagentLaunches > 0) reservedSubagentLaunches -= 1;
      grantWaitingLaunches();
    },
    onSubagentStart: () => {
      if (reservedSubagentLaunches > 0) reservedSubagentLaunches -= 1;
    },
    reservedSubagentLaunches: () => reservedSubagentLaunches
  };
}