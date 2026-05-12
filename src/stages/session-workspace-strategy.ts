import { existsSync, statSync } from "node:fs";

export type SessionWorkspaceMode = "workspace-default" | "session-preferred" | "session-required";

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
  const sessionWorkspaceDir =
    typeof sessionWorkspaceDirRaw === "string" && sessionWorkspaceDirRaw.trim().length > 0
      ? sessionWorkspaceDirRaw
      : undefined;

  if (mode === "workspace-default") return workspaceDir;

  if (sessionWorkspaceDir && isReadableDirectory(sessionWorkspaceDir)) {
    return sessionWorkspaceDir;
  }

  if (mode === "session-required") return undefined;

  return workspaceDir;
}
