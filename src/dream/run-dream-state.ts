import type { DreamRunState, RunDreamOptions } from "./run-dream-types.js";

export function shouldIgnoreSavedAdapterCheckpoint(
  previousState: DreamRunState,
  loadedMemoryCount: number,
  options: Pick<RunDreamOptions, "replayFromStart" | "resetState">,
): {
  ignore: boolean;
  reason?: "reset-state" | "replay-from-start" | "empty-memory-auto-replay";
} {
  if (options.resetState === true) {
    return { ignore: true, reason: "reset-state" };
  }
  if (options.replayFromStart === true) {
    return { ignore: true, reason: "replay-from-start" };
  }

  const hasSavedCheckpoint = Boolean(
    previousState.adapterCheckpoint ?? previousState.cursor,
  );
  if (loadedMemoryCount === 0 && hasSavedCheckpoint) {
    return { ignore: true, reason: "empty-memory-auto-replay" };
  }

  return { ignore: false };
}
