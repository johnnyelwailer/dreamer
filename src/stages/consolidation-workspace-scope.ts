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
  executionRootDir: string,
  sessionSourceWorkspaceById: Map<string, string>,
  sessionIds: string[],
): ScopeResolution {
  void executionRootDir;
  if (requestedScope !== "workspace") {
    return { scope: requestedScope, downgradedSessionIds: [] };
  }

  if (sessionIds.length === 0) {
    return { scope: requestedScope, downgradedSessionIds: [] };
  }

  const distinctWorkspaces = new Set<string>();
  const bySessionId = new Map<string, string>();
  for (const sessionId of sessionIds) {
    const sourceWorkspace = sessionSourceWorkspaceById.get(sessionId);
    if (!sourceWorkspace) continue;
    const normalized = normalizeWorkspacePath(sourceWorkspace);
    distinctWorkspaces.add(normalized);
    bySessionId.set(sessionId, normalized);
  }

  if (distinctWorkspaces.size <= 1) {
    return { scope: requestedScope, downgradedSessionIds: [] };
  }

  const [firstWorkspace] = [...distinctWorkspaces];
  const downgradedSessionIds = sessionIds.filter(
    (sessionId) => bySessionId.get(sessionId) !== undefined && bySessionId.get(sessionId) !== firstWorkspace,
  );
  return { scope: "user", downgradedSessionIds };
}

export function inferWorkspaceDirFromSessionIds(
  sessionSourceWorkspaceById: Map<string, string>,
  sessionIds: string[],
): string | undefined {
  let canonical: string | undefined;
  let rawValue: string | undefined;
  for (const sessionId of sessionIds) {
    const workspace = sessionSourceWorkspaceById.get(sessionId);
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
