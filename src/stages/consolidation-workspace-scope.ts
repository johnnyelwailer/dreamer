export type RequestedMemoryScope = "user" | "workspace";

export type ScopeResolution = {
  scope: RequestedMemoryScope;
  downgradedSessionIds: string[];
};

function normalizeWorkspacePath(value: string): string {
  return value
    .replaceAll("/", "\\")
    .replace(/[\\/]+$/, "")
    .trim()
    .toLowerCase();
}

export function resolveMemoryScopeBySessionWorkspace(
  requestedScope: RequestedMemoryScope,
  workspaceDir: string,
  sessionWorkspaceById: Map<string, string>,
  sessionIds: string[],
): ScopeResolution {
  if (requestedScope !== "workspace") {
    return { scope: requestedScope, downgradedSessionIds: [] };
  }

  if (sessionIds.length === 0) {
    return { scope: requestedScope, downgradedSessionIds: [] };
  }

  const normalizedWorkspace = normalizeWorkspacePath(workspaceDir);
  const foreignSessionIds: string[] = [];
  for (const sessionId of sessionIds) {
    const sourceWorkspace = sessionWorkspaceById.get(sessionId);
    if (!sourceWorkspace) continue;
    if (normalizeWorkspacePath(sourceWorkspace) !== normalizedWorkspace) {
      foreignSessionIds.push(sessionId);
    }
  }

  if (foreignSessionIds.length > 0) {
    return { scope: "user", downgradedSessionIds: foreignSessionIds };
  }

  return { scope: requestedScope, downgradedSessionIds: [] };
}

export function inferWorkspaceDirFromSessionIds(
  sessionWorkspaceById: Map<string, string>,
  sessionIds: string[],
): string | undefined {
  let canonical: string | undefined;
  let rawValue: string | undefined;
  for (const sessionId of sessionIds) {
    const workspace = sessionWorkspaceById.get(sessionId);
    if (!workspace) continue;
    const normalized = normalizeWorkspacePath(workspace);
    if (!canonical) {
      canonical = normalized;
      rawValue = workspace;
      continue;
    }
    if (normalized !== canonical) return undefined;
  }
  return rawValue;
}
