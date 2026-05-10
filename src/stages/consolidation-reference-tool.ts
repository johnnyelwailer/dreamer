import { defineTool } from "@github/copilot-sdk";
import { readFile } from "node:fs/promises";
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

export function sessionPath(value: string, runDir: string): string {
  return join(runDir, "sessions", normalizeSessionName(value));
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
