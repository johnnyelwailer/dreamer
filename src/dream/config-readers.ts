import type { CopilotSessionScopeMode } from "../adapters/copilot-debug/types.js";
import type { SessionWorkspaceMode } from "../stages/session-workspace-strategy.js";

export type HonchoEnvironment = "local" | "production";

export function readHonchoEnvironment(value: string | undefined): HonchoEnvironment | undefined {
  return value === "local" || value === "production" ? value : undefined;
}

export function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function readSessionScopeMode(value: string | undefined): CopilotSessionScopeMode | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "newest-first") return "newest-first";
  if (normalized === "oldest-first") return "oldest-first";
  if (normalized === "coverage") return "coverage";
  return undefined;
}

export function readSessionWorkspaceMode(value: string | undefined): SessionWorkspaceMode | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "workspace-default") return "workspace-default";
  if (normalized === "session-preferred") return "session-preferred";
  if (normalized === "session-required") return "session-required";
  return undefined;
}
