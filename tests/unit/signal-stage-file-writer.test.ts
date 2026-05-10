import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeSessionFiles } from "../../src/stages/signal-stage-file-writer.js";
import type { NormalizedEvent } from "../../src/core/types.js";

function event(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: overrides.id ?? "e1",
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00.000Z",
    source: "test",
    kind: overrides.kind ?? "message",
    text: overrides.text ?? "",
    metadata: overrides.metadata ?? {}
  };
}

describe("writeSessionFiles", () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(tmpdir(), `dreamer-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty array when no session_start events", async () => {
    const result = await writeSessionFiles(dir, []);
    expect(result).toEqual([]);
  });

  it("writes session file with message counter and tool activity", async () => {
    const events: NormalizedEvent[] = [
      event({ id: "s1", kind: "session_start", timestamp: "2026-01-01T10:00:00.000Z", text: "Session abc started", metadata: { sessionId: "abcdefgh", transcriptPath: "/path/to/abc.jsonl" } }),
      event({ id: "m1", kind: "message", timestamp: "2026-01-01T10:00:01.000Z", text: "fix the bug", metadata: { role: "user" } }),
      event({ id: "t1", kind: "tool", timestamp: "2026-01-01T10:00:02.000Z", text: "Tool start: read_file", metadata: { type: "tool.execution_start", toolName: "read_file" } }),
      event({ id: "t2", kind: "tool", timestamp: "2026-01-01T10:00:03.000Z", text: "Tool complete", metadata: { type: "tool.execution_complete", toolName: "read_file" } }),
      event({ id: "m2", kind: "message", timestamp: "2026-01-01T10:00:04.000Z", text: "here's the fix", metadata: { role: "assistant" } }),
    ];

    const written = await writeSessionFiles(dir, events);
    expect(written).toHaveLength(1);
    expect(written[0]!.sessionIndex).toBe(1);
    expect(written[0]!.messageCount).toBe(2);

    const content = await readFile(join(dir, "sessions", "session-1.md"), "utf8");
    expect(content).toContain("# Session 1");
    expect(content).toContain("ID: abcdefgh");
    expect(content).toContain("Raw transcript: /path/to/abc.jsonl");
    expect(content).toContain("[1] **user**");
    expect(content).toContain("fix the bug");
    expect(content).toContain("[2] **assistant**");
    expect(content).toContain("*(read_file)*");
  });

  it("groups tool calls from multiple sessions separately", async () => {
    const events: NormalizedEvent[] = [
      event({ id: "s1", kind: "session_start", timestamp: "2026-01-01T10:00:00.000Z", metadata: { sessionId: "sess1" } }),
      event({ id: "m1", kind: "message", timestamp: "2026-01-01T10:00:01.000Z", text: "session one", metadata: { role: "user" } }),
      event({ id: "s2", kind: "session_start", timestamp: "2026-01-01T11:00:00.000Z", metadata: { sessionId: "sess2" } }),
      event({ id: "m2", kind: "message", timestamp: "2026-01-01T11:00:01.000Z", text: "session two", metadata: { role: "user" } }),
    ];

    const written = await writeSessionFiles(dir, events);
    expect(written).toHaveLength(2);
    const s1 = await readFile(join(dir, "sessions", "session-1.md"), "utf8");
    const s2 = await readFile(join(dir, "sessions", "session-2.md"), "utf8");
    expect(s1).toContain("session one");
    expect(s1).not.toContain("session two");
    expect(s2).toContain("session two");
    expect(s2).not.toContain("session one");
  });

  it("splits sessions by event order even when session_start timestamps are identical", async () => {
    const ts = "2026-01-01T10:00:00.000Z";
    const events: NormalizedEvent[] = [
      event({ id: "s1", kind: "session_start", timestamp: ts, metadata: { sessionId: "sess1" } }),
      event({ id: "m1", kind: "message", timestamp: ts, text: "first session content", metadata: { role: "user" } }),
      event({ id: "s2", kind: "session_start", timestamp: ts, metadata: { sessionId: "sess2" } }),
      event({ id: "m2", kind: "message", timestamp: ts, text: "second session content", metadata: { role: "user" } })
    ];

    const written = await writeSessionFiles(dir, events);
    expect(written).toHaveLength(2);
    expect(written[0]?.messageCount).toBe(1);
    expect(written[1]?.messageCount).toBe(1);

    const s1 = await readFile(join(dir, "sessions", "session-1.md"), "utf8");
    const s2 = await readFile(join(dir, "sessions", "session-2.md"), "utf8");
    expect(s1).toContain("first session content");
    expect(s1).not.toContain("second session content");
    expect(s2).toContain("second session content");
    expect(s2).not.toContain("first session content");
  });
});
