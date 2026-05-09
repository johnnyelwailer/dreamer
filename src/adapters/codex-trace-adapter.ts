import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonLines } from "./shared.js";

type CodexRow = {
  id?: string;
  run_id?: string;
  ts?: string | number;
  kind?: string;
  content?: string;
};

export class CodexTraceAdapter implements TranscriptAdapter {
  readonly id = "adapter.codex.trace";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const rows = await readJsonLines(this.filePath).catch(() => []);
    const events = rows.map((row, index) => this.toEvent(row as CodexRow, index));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private toEvent(row: CodexRow, index: number): NormalizedEvent {
    const runId = row.run_id ?? "codex";
    const kind = row.kind === "session_start" ? "session_start" : "message";
    return asEvent("codex", row.id ?? `${runId}:${index}`, kind, parseIso(row.ts), row.content ?? "", {
      rawKind: row.kind ?? "unknown"
    });
  }
}
