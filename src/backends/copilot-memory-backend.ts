import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";
import { MEMORY_CATEGORIES, type MemoryCategory } from "../core/types.js";
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

export type CopilotTargetPaths = {
  resolvedPath: string;
  userPath: string;
  workspacePath: string;
};

function recordsForScope(
  records: MemoryRecord[],
  scope: "user" | "repo" | "session",
): MemoryRecord[] {
  if (scope === "repo")
    return records.filter((record) => record.scope === "workspace");
  return records.filter((record) => record.scope === scope);
}

function bulletMarkdown(records: MemoryRecord[]): string {
  const lines = records
    .map((record) => `- ${record.statement}`)
    .filter((line) => line.trim().length > 2);
  return `${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

function categorySlug(record: MemoryRecord): string {
  const raw = record.context?.category ?? "other";
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "other";
}

function inferCategoryFromPath(path: string): string | undefined {
  const name = basename(path).replace(/\.md$/i, "");
  if (!name || name.startsWith("dreamer-")) return undefined;
  return name;
}

function normalizeCategoryValue(value?: string): MemoryCategory | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return MEMORY_CATEGORIES.includes(
    normalized as (typeof MEMORY_CATEGORIES)[number],
  )
    ? (normalized as (typeof MEMORY_CATEGORIES)[number])
    : undefined;
}

function normalizeComparablePath(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\\/]+/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathsMatch(left?: string, right?: string): boolean {
  return Boolean(
    left &&
    right &&
    normalizeComparablePath(left) === normalizeComparablePath(right),
  );
}

export function resolveCopilotTargetPaths(
  workspaceDir: string,
  targetPath?: string,
): CopilotTargetPaths {
  const resolvedPath = targetPath ?? defaultCopilotMemoryTarget(workspaceDir);
  const discoveredWorkspacePath = discoverCopilotWorkspaceMemoryRoot(
    workspaceDir,
    false,
  );
  const discoveredGlobalPath = discoverCopilotGlobalMemoryRoot(false);

  if (targetPath) {
    const usesOfficialCopilotRoot =
      pathsMatch(resolvedPath, discoveredGlobalPath) ||
      pathsMatch(resolvedPath, discoveredWorkspacePath);
    if (usesOfficialCopilotRoot) {
      return {
        resolvedPath,
        userPath: discoveredGlobalPath ?? resolvedPath,
        workspacePath: discoveredWorkspacePath ?? resolvedPath,
      };
    }

    return {
      resolvedPath,
      userPath: resolvedPath,
      workspacePath: resolvedPath,
    };
  }

  const workspacePath = discoveredWorkspacePath ?? resolvedPath;
  const userPath = discoveredGlobalPath ?? workspacePath;
  return { resolvedPath, userPath, workspacePath };
}

export function resolveCopilotDestinationPath(
  workspaceDir: string,
  scope: "user" | "workspace" | "session",
  category: string | undefined,
  targetPath?: string,
): string {
  const paths = resolveCopilotTargetPaths(workspaceDir, targetPath);
  const fileName = `${
    (category ?? "other")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  }.md`;
  if (scope === "user") return join(paths.userPath, fileName);
  if (scope === "session")
    return join(paths.workspacePath, "session", fileName);
  return join(paths.workspacePath, "repo", fileName);
}

function mergeByStatement(
  existing: MemoryRecord[],
  incoming: MemoryRecord[],
): MemoryRecord[] {
  const merged = new Map<string, MemoryRecord>();
  for (const record of existing) {
    merged.set(record.statement.trim().toLowerCase(), record);
  }
  for (const record of incoming) {
    merged.set(record.statement.trim().toLowerCase(), record);
  }
  return [...merged.values()];
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
    const { resolvedPath, userPath, workspacePath } = resolveCopilotTargetPaths(
      workspaceDir,
      targetPath,
    );
    if (resolvedPath.endsWith(".json")) {
      this.target = { kind: "legacy-json-file", path: resolvedPath };
      return;
    }
    if (resolvedPath.endsWith(".md")) {
      this.target = { kind: "markdown-file", path: resolvedPath };
      return;
    }
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

    const loaded: MemoryRecord[] = [];
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
          const inferredCategory = normalizeCategoryValue(
            inferCategoryFromPath(fullPath),
          );
          const fromMachineBlock = parseMachineBlock(raw);
          if (fromMachineBlock.length > 0) {
            loaded.push(
              ...fromMachineBlock.map((record) => ({
                ...record,
                scope: inferredScope,
                context: {
                  ...record.context,
                  category: record.context?.category ?? inferredCategory,
                },
              })),
            );
            continue;
          }
          const parsed = parseBulletStatements(
            raw,
            inferredScope,
            "copilot-memory-markdown",
          ).map((record) => ({
            ...record,
            context: {
              ...record.context,
              category: inferredCategory,
            },
          }));
          loaded.push(...parsed);
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

    const targets = new Map<string, MemoryRecord[]>();
    for (const record of records) {
      const scopeRoot =
        record.scope === "user"
          ? this.target.userPath
          : record.scope === "session"
            ? join(this.target.workspacePath, "session")
            : join(this.target.workspacePath, "repo");
      const destination = join(scopeRoot, `${categorySlug(record)}.md`);
      const current = targets.get(destination) ?? [];
      current.push(record);
      targets.set(destination, current);
    }

    for (const [path, incoming] of targets.entries()) {
      let existing: MemoryRecord[] = [];
      try {
        const raw = await readFile(path, "utf8");
        const scope = scopeFromPath(path);
        const category = normalizeCategoryValue(inferCategoryFromPath(path));
        const machine = parseMachineBlock(raw);
        if (machine.length > 0) {
          existing = machine.map((record) => ({
            ...record,
            scope,
            context: {
              ...record.context,
              category: record.context?.category ?? category,
            },
          }));
        } else {
          existing = parseBulletStatements(
            raw,
            scope,
            "copilot-memory-markdown",
          ).map((record) => ({
            ...record,
            context: {
              ...record.context,
              category,
            },
          }));
        }
      } catch {
        existing = [];
      }

      const merged = mergeByStatement(existing, incoming);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bulletMarkdown(merged), "utf8");
    }
  }
}
