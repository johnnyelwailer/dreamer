import { basename, join } from "node:path";
import type { DreamConfig } from "../dream/config.js";

export type JudgeEvidenceFile = {
  path: string;
  kind: "transcript" | "event-log";
};

export function resolveJudgeEvidenceFiles(config: DreamConfig): JudgeEvidenceFile[] {
  if (config.adapterId === "adapter.copilot.debug") {
    const sessionId = basename(config.copilotDebugSessionDir);
    return [
      {
        kind: "transcript",
        path: join(config.copilotDebugSessionDir, "..", "..", "transcripts", `${sessionId}.jsonl`)
      }
    ];
  }

  if (config.adapterId === "adapter.jsonl.event") {
    return [{ kind: "event-log", path: config.jsonlEventsPath }];
  }
  if (config.adapterId === "adapter.claude.code") {
    return [{ kind: "transcript", path: config.claudeCodePath }];
  }
  if (config.adapterId === "adapter.codex.trace") {
    return [{ kind: "transcript", path: config.codexTracePath }];
  }
  if (config.adapterId === "adapter.terminal.recording") {
    return [{ kind: "event-log", path: config.terminalCastPath }];
  }
  if (config.adapterId === "adapter.browser.trace") {
    return [{ kind: "event-log", path: config.browserHarPath }];
  }
  return [];
}

export function buildEvidenceToolingSection(files: JudgeEvidenceFile[]): string {
  if (!files.length) {
    return [
      "Evidence Files:",
      "- none",
      "",
      "If transcript tools are unavailable, score only from docs/artifacts and call out missing evidence."
    ].join("\n");
  }

  return [
    "Evidence Files (use native tools to inspect; do not assume):",
    ...files.map((file, index) => `- [${index + 1}] kind=${file.kind} path=${file.path}`),
    "",
    "Required analysis focus while exploring evidence files:",
    "- User reactions: confusion, acceptance, pushback, satisfaction, frustration, and requests for changes.",
    "- Assistant behavior: tool usage quality, follow-through, error handling, iteration quality, and conclusion quality.",
    "- Ground each score rationale in concrete observed patterns from the evidence files."
  ].join("\n");
}