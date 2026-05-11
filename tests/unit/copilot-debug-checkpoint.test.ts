import { describe, expect, it } from "vitest";
import { prioritizeSessions } from "../../src/adapters/copilot-debug/checkpoint.js";
import type { CopilotDiscoveredSession } from "../../src/adapters/copilot-debug/types.js";

function buildSession(
  path: string,
  activityMs: number,
  richnessScore = 0
): CopilotDiscoveredSession {
  return {
    sessionId: path.split("/").pop() ?? path,
    path,
    mainJsonlPath: `${path}/main.jsonl`,
    transcriptPath: `${path}/transcript.jsonl`,
    mainMtimeMs: activityMs,
    transcriptMtimeMs: activityMs,
    activityMs,
    richnessScore,
    transcriptLineCount: 0
  };
}

describe("prioritizeSessions", () => {
  const newest = buildSession("/sessions/newest", 300, 2);
  const middle = buildSession("/sessions/middle", 200, 3);
  const oldest = buildSession("/sessions/oldest", 100, 1);

  it("orders by newest activity first in newest-first mode", () => {
    const ordered = prioritizeSessions([middle, oldest, newest], {}, "newest-first");
    expect(ordered.map((session) => session.path)).toEqual([
      "/sessions/newest",
      "/sessions/middle",
      "/sessions/oldest"
    ]);
  });

  it("keeps newest-first ordering while preferring stale sessions over up-to-date ones", () => {
    const ordered = prioritizeSessions(
      [newest, middle, oldest],
      {
        "/sessions/newest": {
          lastProcessedAt: "2026-05-11T12:00:00.000Z",
          lastObservedActivityMs: newest.activityMs,
          lastObservedTranscriptLineCount: newest.transcriptLineCount
        }
      },
      "newest-first"
    );
    expect(ordered.map((session) => session.path)).toEqual([
      "/sessions/middle",
      "/sessions/oldest",
      "/sessions/newest"
    ]);
  });

  it("orders by oldest activity first in oldest-first mode", () => {
    const ordered = prioritizeSessions([middle, newest, oldest], {}, "oldest-first");
    expect(ordered.map((session) => session.path)).toEqual([
      "/sessions/oldest",
      "/sessions/middle",
      "/sessions/newest"
    ]);
  });

  it("keeps oldest-first ordering while preferring stale sessions over up-to-date ones", () => {
    const ordered = prioritizeSessions(
      [newest, middle, oldest],
      {
        "/sessions/oldest": {
          lastProcessedAt: "2026-05-11T12:00:00.000Z",
          lastObservedActivityMs: oldest.activityMs,
          lastObservedTranscriptLineCount: oldest.transcriptLineCount
        }
      },
      "oldest-first"
    );
    expect(ordered.map((session) => session.path)).toEqual([
      "/sessions/middle",
      "/sessions/newest",
      "/sessions/oldest"
    ]);
  });

  it("prioritizes unseen then least-recently-processed sessions in coverage mode", () => {
    const ordered = prioritizeSessions(
      [newest, middle, oldest],
      {
        "/sessions/newest": { lastProcessedAt: "2026-05-11T12:00:00.000Z" },
        "/sessions/oldest": { lastProcessedAt: "2026-05-11T10:00:00.000Z" }
      },
      "coverage"
    );

    expect(ordered.map((session) => session.path)).toEqual([
      "/sessions/middle",
      "/sessions/oldest",
      "/sessions/newest"
    ]);
  });
});
