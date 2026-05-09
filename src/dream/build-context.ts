import type { DreamContext } from "../core/types.js";

export function buildContext(workspaceDir: string, runId: string): DreamContext {
  return {
    workspaceDir,
    runId,
    nowIso: new Date().toISOString(),
    events: [],
    memories: [],
    signals: [],
    diary: [],
    metrics: {
      sessionsProcessed: 0,
      memoriesAdded: 0,
      memoriesUpdated: 0,
      contradictionsFound: 0,
      docsGenerated: 0,
      skillPatchesProposed: 0
    }
  };
}
