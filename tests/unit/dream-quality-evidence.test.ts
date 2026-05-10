import { describe, expect, it } from "vitest";
import { buildEvidenceToolingSection, resolveJudgeEvidenceFiles } from "../../src/eval/dream-quality-evidence.js";
import type { TranscriptAdapter } from "../../src/core/contracts.js";

describe("dream quality evidence", () => {
  it("delegates evidence file resolution to the adapter", () => {
    const adapter: TranscriptAdapter = {
      id: "adapter.stub",
      supportsIncremental: false,
      ingest: async () => ({ events: [] }),
      evidenceFiles: () => [{ path: "/tmp/ws/transcripts/session-123.jsonl", kind: "transcript" }]
    };
    const files = resolveJudgeEvidenceFiles(adapter);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe("transcript");
    expect(files[0]?.path).toBe("/tmp/ws/transcripts/session-123.jsonl");
  });

  it("builds evidence instructions with memory vs transcript comparison focus", () => {
    const section = buildEvidenceToolingSection([
      { kind: "transcript", path: "/tmp/ws/transcripts/session-123.jsonl" }
    ]);
    expect(section).toContain("use the tools to read them");
    expect(section).toContain("transcript / event-log");
    expect(section).toContain("memory-output");
    expect(section).toContain("/tmp/ws/transcripts/session-123.jsonl");
  });
});