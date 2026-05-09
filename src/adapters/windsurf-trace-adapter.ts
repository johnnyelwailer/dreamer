import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonLines } from "./shared.js";

type WindsurfLine = {
  id?: string;
  sessionId?: string;
  timestamp?: string | number;
  type?: string;
  text?: string;
};

export class WindsurfTraceAdapter implements TranscriptAdapter {
  readonly id = "adapter.windsurf.trace";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const rows = await readJsonLines(this.filePath).catch(() => []);
    const events = rows.map((row, idx) => this.mapRow(row as WindsurfLine, idx));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private mapRow(row: WindsurfLine, index: number): NormalizedEvent {
    const session = row.sessionId ?? "windsurf";
    const kind = row.type === "session_start" ? "session_start" : "message";
    return asEvent("windsurf", row.id ?? `${session}:${index}`, kind, parseIso(row.timestamp), row.text ?? "", {
      rawType: row.type ?? "unknown"
    });
  }
}
