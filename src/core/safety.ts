import type { NormalizedEvent } from "./types.js";

export function sanitizeTranscriptText(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "[redacted_code_block]").trim();
}

export function enforceTranscriptInertness(events: NormalizedEvent[]): NormalizedEvent[] {
  return events.map((event) => ({
    ...event,
    text: sanitizeTranscriptText(event.text),
    metadata: {
      ...event.metadata,
      treatedAsData: true
    }
  }));
}

export function assertSafeWritePath(baseDir: string, candidate: string): string {
  const normalized = candidate.startsWith(baseDir) ? candidate : "";
  if (!normalized) throw new Error(`Unsafe write path blocked: ${candidate}`);
  return normalized;
}
