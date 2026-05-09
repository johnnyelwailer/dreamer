import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";

type SessionStart = {
  ts?: number;
  sid?: string;
  type?: string;
  attrs?: { copilotVersion?: string; vscodeVersion?: string };
};

export class CopilotDebugAdapter implements TranscriptAdapter {
  readonly id = "adapter.copilot.debug";
  readonly supportsIncremental = true;

  constructor(private readonly sessionDir: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const mainPath = join(this.sessionDir, "main.jsonl");
    const modelPath = join(this.sessionDir, "models.json");
    const lines = await this.safeReadLines(mainPath);
    const sessionEvent = this.mapSessionStart(lines[0] ?? "{}");
    if (since && sessionEvent.timestamp <= since) {
      return { events: [], cursor: since };
    }
    const modelEvent = await this.mapModels(modelPath);
    return {
      events: [sessionEvent, modelEvent].filter(Boolean) as NormalizedEvent[],
      cursor: sessionEvent.timestamp
    };
  }

  private async safeReadLines(filePath: string): Promise<string[]> {
    try {
      const raw = await readFile(filePath, "utf8");
      return raw.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  private mapSessionStart(line: string): NormalizedEvent {
    const parsed = JSON.parse(line) as SessionStart;
    const sid = parsed.sid ?? "unknown-session";
    const ts = parsed.ts ? new Date(parsed.ts).toISOString() : new Date().toISOString();
    return {
      id: `copilot:${sid}:start`,
      timestamp: ts,
      source: "copilot-debug",
      kind: parsed.type === "session_start" ? "session_start" : "unknown",
      text: `Session ${sid} started`,
      metadata: {
        copilotVersion: parsed.attrs?.copilotVersion ?? "unknown",
        vscodeVersion: parsed.attrs?.vscodeVersion ?? "unknown"
      }
    };
  }

  private async mapModels(filePath: string): Promise<NormalizedEvent | null> {
    try {
      const raw = await readFile(filePath, "utf8");
      const models = JSON.parse(raw) as Array<{ id?: string; vendor?: string }>;
      const first = models[0] ?? {};
      return {
        id: `copilot:model:${String(first.id ?? "unknown")}`,
        timestamp: new Date().toISOString(),
        source: "copilot-debug",
        kind: "unknown",
        text: `Model metadata discovered: ${String(first.id ?? "unknown")}`,
        metadata: { vendor: String(first.vendor ?? "unknown") }
      };
    } catch {
      return null;
    }
  }
}
