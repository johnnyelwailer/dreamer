import { defineTool } from "@github/copilot-sdk";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

type ReferenceToolOptions = {
  workspaceDir: string;
  runDir: string;
};

export function safeReadPath(path: string, options: ReferenceToolOptions): string | null {
  const absolute = resolve(isAbsolute(path) ? path : join(options.workspaceDir, path));
  const roots = [resolve(options.workspaceDir), resolve(options.runDir)];
  const allowed = roots.some((root) => {
    const rel = relative(root, absolute);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
  return allowed ? absolute : null;
}

function normalizeSessionName(value: string): string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return `session-${trimmed}.md`;
  if (trimmed.startsWith("session-") && !trimmed.endsWith(".md")) return `${trimmed}.md`;
  if (trimmed.endsWith(".md")) return trimmed;
  return `${trimmed}.md`;
}

function readSessionHeaderId(path: string): string | null {
  try {
    const firstLines = readFileSync(path, "utf8").split("\n").slice(0, 6);
    const idLine = firstLines.find((line) => line.startsWith("Source: ") && line.includes(" | ID: "));
    if (!idLine) return null;
    const marker = " | ID: ";
    const index = idLine.indexOf(marker);
    if (index < 0) return null;
    const id = idLine.slice(index + marker.length).trim().toLowerCase();
    return id || null;
  } catch {
    return null;
  }
}

function resolveSessionById(value: string, runDir: string): string | null {
  const sessionsDir = join(runDir, "sessions");
  if (!existsSync(sessionsDir)) return null;
  const normalized = value.trim().toLowerCase();
  const shortId = normalized.slice(0, 8);
  const files = readdirSync(sessionsDir).filter((name) => /^session-\d+\.md$/i.test(name));
  for (const file of files) {
    const candidate = join(sessionsDir, file);
    const headerId = readSessionHeaderId(candidate);
    if (!headerId) continue;
    if (headerId === normalized || headerId === shortId || normalized.startsWith(headerId)) {
      return candidate;
    }
  }
  return null;
}

export function sessionPath(value: string, runDir: string): string {
  const trimmed = value.trim();
  const sessionsDir = join(runDir, "sessions");

  const explicitSessionMatch = trimmed.match(/(^|\/)session-\d+(?:\.md)?$/i);
  if (explicitSessionMatch) {
    const tail = explicitSessionMatch[0].replace(/^\//, "");
    const name = tail.endsWith(".md") ? tail : `${tail}.md`;
    return join(sessionsDir, name);
  }

  const normalizedName = normalizeSessionName(trimmed);
  const normalizedPath = join(sessionsDir, normalizedName);
  if (existsSync(normalizedPath)) return normalizedPath;

  const byId = resolveSessionById(trimmed, runDir);
  if (byId) return byId;

  return normalizedPath;
}

export function resolveReferencePath(kind: string, value: string, options: ReferenceToolOptions): string | null {
  if (kind === "doc" && value.startsWith("dream-run:")) return null;
  if (kind === "url") return null;
  const candidate = kind === "session" ? sessionPath(value, options.runDir) : value;
  return safeReadPath(candidate, options);
}

export function createReadReferenceTool(options: ReferenceToolOptions) {
  return defineTool("read_reference", {
    description: "Read a cited memory reference from the workspace or current dream run. Use this before pruning, contradicting, or generalizing a memory.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["file", "doc", "session", "url"] },
        value: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" }
      },
      required: ["kind", "value"]
    },
    skipPermission: true,
    handler: async (args: Record<string, unknown>) => {
      const kind = String(args.kind ?? "");
      const value = String(args.value ?? "").trim();
      if (!value) return { textResultForLlm: "Missing reference value.", resultType: "error" as const };
      if (kind === "url") return { textResultForLlm: `URL reference cannot be fetched here: ${value}`, resultType: "success" as const };
      if (kind === "doc" && value.startsWith("dream-run:")) {
        return { textResultForLlm: `Dream run reference: ${value}`, resultType: "success" as const };
      }

      const path = resolveReferencePath(kind, value, options);
      if (!path) return { textResultForLlm: "Reference path not allowed.", resultType: "error" as const };

      try {
        const lines = (await readFile(path, "utf8")).split("\n");
        const start = Math.max(1, Number(args.start_line) || 1);
        const end = Math.min(lines.length, Number(args.end_line) || start + 119);
        return {
          textResultForLlm: `[${start}-${end} of ${lines.length}] ${path}\n${lines.slice(start - 1, end).join("\n")}`,
          resultType: "success" as const
        };
      } catch {
        return { textResultForLlm: `Reference not readable: ${value}`, resultType: "error" as const };
      }
    }
  });
}
