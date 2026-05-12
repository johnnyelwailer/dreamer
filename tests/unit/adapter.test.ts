import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CopilotDebugAdapter } from "../../src/adapters/copilot-debug-adapter.js";
import { JsonlEventAdapter } from "../../src/adapters/jsonl-event-adapter.js";

describe("CopilotDebugAdapter", () => {
  it("ingests fixture session logs into normalized events", async () => {
    const adapter = new CopilotDebugAdapter(".dreamer/fixtures/copilot-session");
    const result = await adapter.ingest();
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0]?.kind).toBe("session_start");
  });

  it("supports cursor-based incremental ingestion", async () => {
    const adapter = new CopilotDebugAdapter(".dreamer/fixtures/copilot-session");
    const first = await adapter.ingest();
    expect(first.events.length).toBeGreaterThan(0);
    const second = await adapter.ingest(first.cursor);
    expect(second.events.length).toBe(0);
  });

  it("ingests transcript messages and tool events when transcript artifacts exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "dreamer-copilot-adapter-"));
    const sessionId = "session-test";
    const sessionDir = join(root, "GitHub.copilot-chat", "debug-logs", sessionId);
    const transcriptsDir = join(root, "GitHub.copilot-chat", "transcripts");

    try {
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(transcriptsDir, { recursive: true });

      writeFileSync(
        join(sessionDir, "main.jsonl"),
        JSON.stringify({
          ts: 1778345912364,
          sid: sessionId,
          type: "session_start",
          attrs: { copilotVersion: "0.1", vscodeVersion: "1.0" }
        }) + "\n",
        "utf8"
      );
      writeFileSync(join(sessionDir, "models.json"), JSON.stringify([{ id: "model-x", vendor: "Vendor" }]), "utf8");
      writeFileSync(
        join(transcriptsDir, `${sessionId}.jsonl`),
        [
          JSON.stringify({
            type: "user.message",
            id: "u1",
            timestamp: "2026-05-09T15:00:01.000Z",
            data: { content: "Need diagnostics by transcript" }
          }),
          JSON.stringify({
            type: "assistant.message",
            id: "a1",
            timestamp: "2026-05-09T15:00:02.000Z",
            data: {
              content: "",
              toolRequests: [{ name: "read_file" }]
            }
          }),
          JSON.stringify({
            type: "tool.execution_start",
            id: "t1",
            timestamp: "2026-05-09T15:00:03.000Z",
            data: { toolName: "read_file", toolCallId: "call-1" }
          })
        ].join("\n"),
        "utf8"
      );

      const adapter = new CopilotDebugAdapter(sessionDir);
      const result = await adapter.ingest();
      const messageEvents = result.events.filter((event) => event.kind === "message");
      const toolEvents = result.events.filter((event) => event.kind === "tool");

      expect(messageEvents.length).toBeGreaterThan(0);
      expect(toolEvents.length).toBeGreaterThan(0);
      expect(result.events.some((event) => event.text.includes("diagnostics"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits session workspace metadata when workspace.json is available", async () => {
    const root = mkdtempSync(join(tmpdir(), "dreamer-copilot-adapter-"));
    const workspaceStorageRoot = join(root, "workspaceStorage");
    const workspaceId = "workspace-abc";
    const workspaceDir = join(root, "repo-target");
    const sessionId = "session-workspace";
    const sessionDir = join(workspaceStorageRoot, workspaceId, "GitHub.copilot-chat", "debug-logs", sessionId);

    try {
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(join(sessionDir, "main.jsonl"), JSON.stringify({ type: "session_start", sid: sessionId }) + "\n", "utf8");
      writeFileSync(join(sessionDir, "models.json"), "[]", "utf8");
      writeFileSync(
        join(workspaceStorageRoot, workspaceId, "workspace.json"),
        JSON.stringify({ folder: pathToFileURL(workspaceDir).toString() }),
        "utf8"
      );

      const adapter = new CopilotDebugAdapter({
        discoveryMode: "override",
        searchPaths: [workspaceStorageRoot],
        maxSessionsPerRun: 1
      });
      const result = await adapter.ingest();
      const sessionStart = result.events.find((event) => event.kind === "session_start");

      expect(sessionStart?.metadata.workspaceDir).toBe(workspaceDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("JsonlEventAdapter", () => {
  it("filters events older than or equal to cursor", async () => {
    const adapter = new JsonlEventAdapter(".dreamer/fixtures/events.jsonl");
    const first = await adapter.ingest();
    expect(first.events.length).toBe(2);
    const second = await adapter.ingest("2026-05-09T10:00:30.000Z");
    expect(second.events.length).toBe(1);
    expect(second.events[0]?.id).toBe("e2");
  });
});
