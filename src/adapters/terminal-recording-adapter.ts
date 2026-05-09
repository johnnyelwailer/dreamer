import { readFile } from "node:fs/promises";
import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent } from "./shared.js";

type CastFrame = [number, string, string];

export class TerminalRecordingAdapter implements TranscriptAdapter {
  readonly id = "adapter.terminal.recording";
  readonly supportsIncremental = true;

  constructor(private readonly castFilePath: string) {}

  async ingest(checkpoint?: unknown): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const since = typeof checkpoint === "string" ? checkpoint : undefined;
    const raw = await readFile(this.castFilePath, "utf8").catch(() => "");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return { events: [], cursor: since };
    const events = lines.slice(1).map((line, idx) => this.mapFrame(line, idx));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private mapFrame(line: string, index: number): NormalizedEvent {
    const frame = JSON.parse(line) as CastFrame;
    const seconds = Number(frame[0] ?? index);
    const text = String(frame[2] ?? "").trim();
    const ts = new Date(seconds * 1000).toISOString();
    return asEvent("terminal-cast", `terminal:${index}`, "tool", ts, text, {
      stream: String(frame[1] ?? "o")
    });
  }
}
