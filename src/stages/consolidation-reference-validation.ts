import { existsSync } from "node:fs";
import type { MemoryReference } from "../core/types.js";
import { resolveReferencePath } from "./consolidation-reference-tool.js";

type ValidationOptions = {
  workspaceDir: string;
  runDir: string;
};

function validateUrlBestEffort(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateReferencesStrict(
  references: MemoryReference[],
  options: ValidationOptions
): { ok: true } | { ok: false; message: string } {
  if (!references.length) {
    return { ok: false, message: "At least one valid reference is required." };
  }

  for (const reference of references) {
    if (reference.kind === "url") {
      if (!validateUrlBestEffort(reference.value)) {
        return { ok: false, message: `Invalid URL reference: ${reference.value}` };
      }
      continue;
    }
    if (reference.kind === "doc" && reference.value.startsWith("dream-run:")) continue;

    const resolved = resolveReferencePath(reference.kind, reference.value, options);
    if (!resolved) {
      return { ok: false, message: `Reference path not allowed: ${reference.kind}:${reference.value}` };
    }
    if (!existsSync(resolved)) {
      return { ok: false, message: `Reference target not found: ${reference.kind}:${reference.value}` };
    }
  }

  return { ok: true };
}
