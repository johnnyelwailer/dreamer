import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { DreamConfig } from "../dream/config.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export type JudgeEvidenceFile = {
  path: string;
  kind: "transcript" | "event-log" | "memory-output";
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

export function resolveMemoryOutputFiles(workspaceDir: string): JudgeEvidenceFile[] {
  const storageDir = workspaceStorageDir(workspaceDir);
  const candidates = ["memory.json", "copilot-memory.json"];
  return candidates
    .filter((p) => existsSync(join(storageDir, p)))
    .map((p) => ({ kind: "memory-output" as const, path: join(storageDir, p) }));
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
    "Evidence Files (use the tools to read them — do NOT guess their contents):",
    ...files.map((file, index) => `- [${index + 1}] kind=${file.kind} path=${file.path}`),
    "",
    "Your task: compare input vs output.",
    "- transcript / event-log = the input the dreamer processed",
    "- memory-output = what the dreamer extracted and stored",
    "Judge whether the extracted memories accurately reflect the important signals from the transcript."
  ].join("\n");
}