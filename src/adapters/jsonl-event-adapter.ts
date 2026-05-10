import { readFile } from "node:fs/promises";
import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";

type RawEvent = {
  id?: string;
  timestamp?: string;
  source?: string;
  type?: "session_start" | "message" | "tool" | "unknown";
  text?: string;
};

export class JsonlEventAdapter implements TranscriptAdapter {
  readonly id = "adapter.jsonl.events";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  evidenceFiles() {
    return [{ path: this.filePath, kind: "event-log" as const }];
  }

  async ingest(checkpoint?: unknown): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const since = typeof checkpoint === "string" ? checkpoint : undefined;
    const lines = await this.safeReadLines();
    const parsed = lines.map((line, index) => this.mapLine(line, index));
    const filtered = since ? parsed.filter((event) => event.timestamp > since) : parsed;
    const cursor = filtered.at(-1)?.timestamp ?? since;
    return { events: filtered, cursor };
  }

  private async safeReadLines(): Promise<string[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return raw.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  private mapLine(line: string, index: number): NormalizedEvent {
    const parsed = JSON.parse(line) as RawEvent;
    return {
      id: parsed.id ?? `jsonl:${index}`,
      timestamp: parsed.timestamp ?? new Date(0).toISOString(),
      source: parsed.source ?? "jsonl",
      kind: parsed.type ?? "unknown",
      text: parsed.text ?? "",
      metadata: {}
    };
  }
}
