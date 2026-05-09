import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonLines } from "./shared.js";

type ClaudeLine = {
  id?: string;
  session_id?: string;
  timestamp?: string | number;
  event?: string;
  role?: string;
  content?: string;
};

export class ClaudeCodeAdapter implements TranscriptAdapter {
  readonly id = "adapter.claude.code";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const lines = await readJsonLines(this.filePath).catch(() => []);
    const events = lines.map((line, idx) => this.mapLine(line as ClaudeLine, idx));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private mapLine(line: ClaudeLine, index: number): NormalizedEvent {
    const sid = line.session_id ?? "claude";
    const id = line.id ?? `${sid}:${index}`;
    const kind = line.event === "session_start" ? "session_start" : "message";
    return asEvent("claude-code", id, kind, parseIso(line.timestamp), line.content ?? "", {
      role: line.role ?? "unknown",
      event: line.event ?? "unknown"
    });
  }
}
