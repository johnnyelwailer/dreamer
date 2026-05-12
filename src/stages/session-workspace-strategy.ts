import { existsSync, statSync } from "node:fs";

export type SessionWorkspaceMode = "workspace-default" | "session-preferred" | "session-required";

export type SessionWorkspaceDecision = {
  workingDirectory?: string;
  source: "workspace-default" | "session" | "fallback" | "missing";
};

function isReadableDirectory(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function resolveSessionWorkingDirectory(
  mode: SessionWorkspaceMode,
  workspaceDir: string,
  sessionWorkspaceDirRaw: unknown
): string | undefined {
  return resolveSessionWorkspaceDecision(mode, workspaceDir, sessionWorkspaceDirRaw).workingDirectory;
}

export function resolveSessionWorkspaceDecision(
  mode: SessionWorkspaceMode,
  workspaceDir: string,
  sessionWorkspaceDirRaw: unknown
): SessionWorkspaceDecision {
  const sessionWorkspaceDir =
    typeof sessionWorkspaceDirRaw === "string" && sessionWorkspaceDirRaw.trim().length > 0
      ? sessionWorkspaceDirRaw
      : undefined;

  if (mode === "workspace-default") {
    return { workingDirectory: workspaceDir, source: "workspace-default" };
  }

  if (sessionWorkspaceDir && isReadableDirectory(sessionWorkspaceDir)) {
    return { workingDirectory: sessionWorkspaceDir, source: "session" };
  }

  if (mode === "session-required") return { source: "missing" };

  return { workingDirectory: workspaceDir, source: "fallback" };
}
