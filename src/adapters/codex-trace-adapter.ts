import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonLines } from "./shared.js";

type CodexRow = {
  id?: string;
  run_id?: string;
  session_id?: string;
  ts?: string | number;
  kind?: string;
  content?: string;
  text?: string;
};

export class CodexTraceAdapter implements TranscriptAdapter {
  readonly id = "adapter.codex.trace";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  evidenceFiles() {
    return [{ path: this.filePath, kind: "transcript" as const }];
  }

  async ingest(checkpoint?: unknown): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const since = typeof checkpoint === "string" ? checkpoint : undefined;
    const rows = await readJsonLines(this.filePath).catch(() => []);
    const events = rows.map((row, index) => this.toEvent(row as CodexRow, index));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private toEvent(row: CodexRow, index: number): NormalizedEvent {
    const runId = row.run_id ?? row.session_id ?? "codex";
    const kind = row.kind === "session_start" ? "session_start" : "message";
    const text = row.content ?? row.text ?? "";
    return asEvent("codex", row.id ?? `${runId}:${index}`, kind, parseIso(row.ts), text, {
      rawKind: row.kind ?? "unknown"
    });
  }
}
