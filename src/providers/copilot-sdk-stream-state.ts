import { buildToolArgsPreview, buildToolCallId } from "./copilot-sdk-stream-format.js";
import { delegatedAgentName, eventSubagentName, type CopilotEvent } from "./copilot-sdk-stream-event-helpers.js";

type PendingTool = {
  name: string;
  args: string;
  argsLines: string[];
  tag: string;
};

type DelegationRequest = { argsPreview: string };

export function createStreamState(agentTag: string) {
  const pendingById = new Map<string, PendingTool>();
  const pendingUnnamed: PendingTool[] = [];
  const pendingDelegationsById = new Map<string, DelegationRequest>();
  const pendingDelegations: DelegationRequest[] = [];
  const agentIdToName = new Map<string, string>();

  function delegatedSuffix(record: CopilotEvent): string | undefined {
    const delegated = eventSubagentName(record);
    if (delegated?.trim()) return delegated.trim();
    const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
    return agentId ? agentIdToName.get(agentId) : undefined;
  }

  function delegationRequestId(record: CopilotEvent): string | undefined {
    return typeof record.id === "string" && record.id.trim() ? record.id.trim() : buildToolCallId(record.data);
  }

  return {
    rememberSubagent(record: CopilotEvent): void {
      const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
      const name = delegatedAgentName(record);
      if (agentId && name !== "unknown-subagent") agentIdToName.set(agentId, name);
    },
    agentTagFor(record: CopilotEvent): string {
      const delegated = delegatedSuffix(record);
      return delegated ? `${agentTag}@${delegated}` : agentTag;
    },
    toolTagFor(toolName: string, record: CopilotEvent): string {
      const delegated = delegatedSuffix(record);
      return delegated ? `${toolName}@${delegated}` : toolName;
    },
    rememberDelegationRequest(record: CopilotEvent, toolName: string): void {
      if (toolName !== "task" && toolName !== "delegate") return;
      const argsPreview = buildToolArgsPreview(record.data);
      if (!argsPreview) return;
      const requestId = delegationRequestId(record);
      if (requestId) pendingDelegationsById.set(requestId, { argsPreview });
      else pendingDelegations.push({ argsPreview });
    },
    consumeDelegationRequest(record: CopilotEvent): DelegationRequest | undefined {
      const requestId = typeof record.parentId === "string" && record.parentId.trim() ? record.parentId.trim() : buildToolCallId(record.data);
      if (requestId) {
        const request = pendingDelegationsById.get(requestId);
        if (request) {
          pendingDelegationsById.delete(requestId);
          return request;
        }
      }
      return pendingDelegations.shift();
    },
    rememberPendingTool(record: CopilotEvent, pending: PendingTool): void {
      const id = buildToolCallId(record.data);
      if (id) pendingById.set(id, pending);
      else pendingUnnamed.push(pending);
    },
    consumePendingTool(record: CopilotEvent): PendingTool | undefined {
      const id = buildToolCallId(record.data);
      const pending = id ? pendingById.get(id) : pendingUnnamed.shift();
      if (id) pendingById.delete(id);
      return pending;
    }
  };
}