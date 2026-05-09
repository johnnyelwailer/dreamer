import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonLines } from "./shared.js";

type CliLine = {
  sid?: string;
  id?: string;
  ts?: number | string;
  type?: string;
  message?: string;
  content?: string;
};

export class CopilotCliAdapter implements TranscriptAdapter {
  readonly id = "adapter.copilot.cli";
  readonly supportsIncremental = true;

  constructor(private readonly logPath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const lines = await readJsonLines(this.logPath).catch(() => []);
    const events = lines.map((line, idx) => this.toEvent(line as CliLine, idx));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private toEvent(line: CliLine, index: number): NormalizedEvent {
    const sid = line.sid ?? "cli";
    const id = line.id ?? `${sid}:${index}`;
    const kind = line.type === "session_start" ? "session_start" : "message";
    const text = line.message ?? line.content ?? "";
    return asEvent("copilot-cli", id, kind, parseIso(line.ts), text, { rawType: line.type ?? "unknown" });
  }
}
