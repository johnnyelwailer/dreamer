import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TranscriptAdapter } from "../core/contracts.js";
import { resolveAssetPath, workspaceStorageDir } from "../dream/dreamer-home.js";

export type JudgeEvidenceFile = {
  path: string;
  kind: "transcript" | "event-log" | "memory-output" | "stage-prompt";
};

export function resolveJudgeEvidenceFiles(adapter: TranscriptAdapter): JudgeEvidenceFile[] {
  return adapter.evidenceFiles();
}

export function resolveMemoryOutputFiles(workspaceDir: string): JudgeEvidenceFile[] {
  const storageDir = workspaceStorageDir(workspaceDir);
  const candidates = ["memory.json", "copilot-memory.json", "copilot-memory.md"];
  return candidates
    .filter((p) => existsSync(join(storageDir, p)))
    .map((p) => ({ kind: "memory-output" as const, path: join(storageDir, p) }));
}

export function resolveStagePromptFiles(): JudgeEvidenceFile[] {
  const candidates = [
    resolveAssetPath("prompts/signal-stage.md"),
    resolveAssetPath("prompts/consolidation-stage.md")
  ];
  return candidates
    .filter((p) => existsSync(p))
    .map((p) => ({ kind: "stage-prompt" as const, path: p }));
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
    "- stage-prompt = the prompts used to guide signal extraction and consolidation",
    "Judge whether the extracted memories accurately reflect the important signals from the transcript.",
    "For prompt_quality: read the stage-prompt files and evaluate their focus, specificity, and efficiency."
  ].join("\n");
}