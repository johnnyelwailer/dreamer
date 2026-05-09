import { describe, expect, it } from "vitest";
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
