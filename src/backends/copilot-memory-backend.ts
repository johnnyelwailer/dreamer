import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";
import {
  defaultCopilotMemoryTarget,
  discoverCopilotGlobalMemoryRoot,
  discoverCopilotWorkspaceMemoryRoot,
} from "../dream/copilot-memory-path.js";

type CopilotMemoryDoc = {
  version: string;
  generatedAt: string;
  records: Array<MemoryRecord & { citations: string[]; validated: boolean }>;
};

type CopilotTarget =
  | { kind: "legacy-json-file"; path: string }
  | { kind: "markdown-file"; path: string }
  | {
      kind: "memory-root";
      path: string;
      userPath: string;
      workspacePath: string;
    };

const MACHINE_BLOCK_START = "<!-- dreamer:records:start -->";
const MACHINE_BLOCK_END = "<!-- dreamer:records:end -->";
const USER_MEMORY_FILE = "dreamer-memory.md";
const REPO_MEMORY_FILE = "dreamer-repo-memory.md";
const SESSION_MEMORY_FILE = "dreamer-session-memory.md";

function recordsForScope(
  records: MemoryRecord[],
  scope: "user" | "repo" | "session",
): MemoryRecord[] {
  if (scope === "repo")
    return records.filter((record) => record.scope === "workspace");
  return records.filter((record) => record.scope === scope);
}

function renderMarkdown(records: MemoryRecord[]): string {
  const statements = records
    .map((record) => {
      const confidence = Number.isFinite(record.confidence)
        ? record.confidence.toFixed(2)
        : "0.50";
      return `- ${record.statement} (confidence: ${confidence})`;
    })
    .join("\n");
  return [
    "# Dreamer Memory Export",
    "",
    "This file is managed by Dreamer.",
    "",
    "## Summary",
    statements.length > 0 ? statements : "- No memory records.",
    "",
    MACHINE_BLOCK_START,
    "```json",
    JSON.stringify(records, null, 2),
    "```",
    MACHINE_BLOCK_END,
    "",
  ].join("\n");
}

function parseMachineBlock(content: string): MemoryRecord[] {
  const start = content.indexOf(MACHINE_BLOCK_START);
  const end = content.indexOf(MACHINE_BLOCK_END);
  if (start < 0 || end < 0 || end <= start) return [];
  const block = content.slice(start + MACHINE_BLOCK_START.length, end);
  const openFence = block.indexOf("```json");
  const closeFence = block.indexOf("```", openFence + 7);
  if (openFence < 0 || closeFence < 0) return [];
  const jsonText = block.slice(openFence + 7, closeFence).trim();
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is MemoryRecord =>
      Boolean(row && typeof row === "object"),
    );
  } catch {
    return [];
  }
}

function parseBulletStatements(
  content: string,
  scope: MemoryRecord["scope"],
  source: string,
): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const statement = trimmed
      .slice(2)
      .replace(/\s*\(confidence:.*\)\s*$/i, "")
      .trim();
    if (!statement) continue;
    records.push({
      id: `${source}-${index++}`,
      scope,
      statement,
      confidence: 0.7,
      provenance: {
        source,
        eventIds: [],
        capturedAt: new Date(0).toISOString(),
      },
    });
  }
  return records;
}

function scopeFromPath(path: string): MemoryRecord["scope"] {
  if (path.includes("/repo/") || path.includes("\\repo\\")) return "workspace";
  if (path.includes("/session/") || path.includes("\\session\\"))
    return "session";
  return "user";
}

export class CopilotMemoryBackend implements MemoryBackend {
  readonly id = "backend.copilot.memory";
  private readonly target: CopilotTarget;

  constructor(workspaceDir: string, targetPath?: string) {
    const resolvedPath = targetPath ?? defaultCopilotMemoryTarget(workspaceDir);
    if (resolvedPath.endsWith(".json")) {
      this.target = { kind: "legacy-json-file", path: resolvedPath };
      return;
    }
    if (resolvedPath.endsWith(".md")) {
      this.target = { kind: "markdown-file", path: resolvedPath };
      return;
    }

    if (targetPath) {
      this.target = {
        kind: "memory-root",
        path: resolvedPath,
        userPath: resolvedPath,
        workspacePath: resolvedPath,
      };
      return;
    }

    const workspacePath =
      discoverCopilotWorkspaceMemoryRoot(workspaceDir, false) ?? resolvedPath;
    const userPath = discoverCopilotGlobalMemoryRoot(false) ?? workspacePath;
    this.target = {
      kind: "memory-root",
      path: resolvedPath,
      userPath,
      workspacePath,
    };
  }

  async load(): Promise<MemoryRecord[]> {
    if (this.target.kind === "legacy-json-file") {
      try {
        const raw = await readFile(this.target.path, "utf8");
        const parsed = JSON.parse(raw) as CopilotMemoryDoc;
        return parsed.records.map((record) => ({
          id: record.id,
          scope: record.scope,
          statement: record.statement,
          confidence: record.confidence,
          provenance: record.provenance,
          contradictoryTo: record.contradictoryTo,
          context: record.context,
          evidence: record.evidence,
          capture: record.capture,
        }));
      } catch {
        return [];
      }
    }

    if (this.target.kind === "markdown-file") {
      try {
        const raw = await readFile(this.target.path, "utf8");
        const fromMachineBlock = parseMachineBlock(raw);
        if (fromMachineBlock.length > 0) return fromMachineBlock;
        return parseBulletStatements(
          raw,
          "workspace",
          "copilot-memory-markdown",
        );
      } catch {
        return [];
      }
    }

    const files: Array<{ path: string; scope: MemoryRecord["scope"] }> = [
      { path: join(this.target.userPath, USER_MEMORY_FILE), scope: "user" },
      {
        path: join(this.target.workspacePath, "repo", REPO_MEMORY_FILE),
        scope: "workspace",
      },
      {
        path: join(this.target.workspacePath, "session", SESSION_MEMORY_FILE),
        scope: "session",
      },
    ];

    const loaded: MemoryRecord[] = [];
    for (const file of files) {
      try {
        const raw = await readFile(file.path, "utf8");
        const fromMachineBlock = parseMachineBlock(raw);
        if (fromMachineBlock.length > 0) {
          loaded.push(
            ...fromMachineBlock.map((record) => ({
              ...record,
              scope: file.scope,
            })),
          );
          continue;
        }
        loaded.push(
          ...parseBulletStatements(raw, file.scope, "copilot-memory-markdown"),
        );
      } catch {
        continue;
      }
    }
    if (loaded.length > 0) return loaded;

    // Fall back to common memory scope folders without recursive tree walking.
    const fallbackDirs = [
      this.target.path,
      this.target.userPath,
      this.target.workspacePath,
      join(this.target.workspacePath, "repo"),
      join(this.target.workspacePath, "session"),
      join(this.target.path, "repo"),
      join(this.target.path, "session"),
    ];
    const uniqueFallbackDirs = [...new Set(fallbackDirs)];
    for (const folder of uniqueFallbackDirs) {
      const entries = await readdir(folder, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const fullPath = join(folder, entry.name);
        try {
          const raw = await readFile(fullPath, "utf8");
          const inferredScope = scopeFromPath(fullPath);
          const fromMachineBlock = parseMachineBlock(raw);
          if (fromMachineBlock.length > 0) {
            loaded.push(
              ...fromMachineBlock.map((record) => ({
                ...record,
                scope: inferredScope,
              })),
            );
            continue;
          }
          loaded.push(
            ...parseBulletStatements(
              raw,
              inferredScope,
              "copilot-memory-markdown",
            ),
          );
        } catch {
          continue;
        }
      }
    }
    return loaded;
  }

  async save(records: MemoryRecord[]): Promise<void> {
    if (this.target.kind === "legacy-json-file") {
      const payload: CopilotMemoryDoc = {
        version: "1",
        generatedAt: new Date().toISOString(),
        records: records.map((record) => ({
          ...record,
          citations: record.provenance.eventIds,
          validated: record.confidence >= 0.7,
        })),
      };
      await mkdir(dirname(this.target.path), { recursive: true });
      await writeFile(
        this.target.path,
        JSON.stringify(payload, null, 2),
        "utf8",
      );
      return;
    }

    if (this.target.kind === "markdown-file") {
      await mkdir(dirname(this.target.path), { recursive: true });
      await writeFile(this.target.path, renderMarkdown(records), "utf8");
      return;
    }

    const scopedFiles = [
      {
        scope: "user" as const,
        path: join(this.target.userPath, USER_MEMORY_FILE),
      },
      {
        scope: "repo" as const,
        path: join(this.target.workspacePath, "repo", REPO_MEMORY_FILE),
      },
      {
        scope: "session" as const,
        path: join(this.target.workspacePath, "session", SESSION_MEMORY_FILE),
      },
    ];

    for (const file of scopedFiles) {
      const next = recordsForScope(records, file.scope);
      if (next.length === 0) {
        await rm(file.path, { force: true }).catch(() => undefined);
        continue;
      }
      await mkdir(dirname(file.path), { recursive: true });
      await writeFile(file.path, renderMarkdown(next), "utf8");
    }
  }
}
