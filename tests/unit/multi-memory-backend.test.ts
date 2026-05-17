import { describe, expect, it, vi } from "vitest";
import { MultiMemoryBackend } from "../../src/backends/multi-memory-backend.js";
import type { MemoryBackend } from "../../src/core/contracts.js";
import type { MemoryRecord } from "../../src/core/types.js";

function record(id: string): MemoryRecord {
  return {
    id,
    scope: "workspace",
    statement: `Memory ${id}`,
    confidence: 0.9,
    provenance: {
      source: "test",
      eventIds: [],
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function backend(id: string, records: MemoryRecord[] = []): MemoryBackend {
  return {
    id,
    load: vi.fn(async () => records),
    save: vi.fn(async () => undefined),
  };
}

describe("MultiMemoryBackend", () => {
  it("loads from the first backend with records", async () => {
    const first = backend("backend.first");
    const second = backend("backend.second", [record("two")]);
    const multi = new MultiMemoryBackend([first, second]);

    await expect(multi.load()).resolves.toEqual([record("two")]);
  });

  it("saves records to every backend", async () => {
    const first = backend("backend.first");
    const second = backend("backend.second");
    const records = [record("one")];
    const multi = new MultiMemoryBackend([first, second]);

    await multi.save(records);

    expect(first.save).toHaveBeenCalledWith(records);
    expect(second.save).toHaveBeenCalledWith(records);
  });
});
