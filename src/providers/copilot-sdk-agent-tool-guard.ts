import type {
  PermissionRequest,
  PermissionRequestResult,
  ToolResultObject
} from "@github/copilot-sdk";
import { createSubagentState } from "./copilot-sdk-subagent-state.js";
import { createAgentToolGuardHooks } from "./copilot-sdk-agent-tool-guard-hooks.js";

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
  onPermissionRequest: (
    request: PermissionRequest,
    invocation: { sessionId: string }
  ) => Promise<PermissionRequestResult> | PermissionRequestResult;
};

type GuardOptions = {
  allowedTaskAgentTypes?: Iterable<string>;
  defaultAgentExcludedTools?: Iterable<string>;
  initialAgent?: string;
  maxParallelSubagents?: number;
};

export function createAgentToolGuard(options: GuardOptions = {}): AgentToolGuard {
  const activeShellIds = new Set<string>();
  const subagents = createSubagentState(options.initialAgent);
  return createAgentToolGuardHooks(options, subagents, activeShellIds);
}
