import { describe, expect, it } from "vitest";
import { shouldIgnoreSavedAdapterCheckpoint } from "../../src/dream/run-dream-state.js";

describe("shouldIgnoreSavedAdapterCheckpoint", () => {
  it("ignores saved state when reset-state is requested", () => {
    expect(
      shouldIgnoreSavedAdapterCheckpoint(
        { cursor: "2026-01-01T00:00:00.000Z" },
        5,
        { resetState: true },
      ),
    ).toEqual({ ignore: true, reason: "reset-state" });
  });

  it("ignores saved state when replay-from-start is requested", () => {
    expect(
      shouldIgnoreSavedAdapterCheckpoint(
        { adapterCheckpoint: { cursor: "x" } },
        5,
        { replayFromStart: true },
      ),
    ).toEqual({ ignore: true, reason: "replay-from-start" });
  });

  it("auto-replays when memories are empty but a saved checkpoint exists", () => {
    expect(
      shouldIgnoreSavedAdapterCheckpoint(
        { cursor: "2026-01-01T00:00:00.000Z" },
        0,
        {},
      ),
    ).toEqual({ ignore: true, reason: "empty-memory-auto-replay" });
  });

  it("keeps incremental state when memories exist", () => {
    expect(
      shouldIgnoreSavedAdapterCheckpoint(
        { cursor: "2026-01-01T00:00:00.000Z" },
        2,
        {},
      ),
    ).toEqual({ ignore: false });
  });
});
