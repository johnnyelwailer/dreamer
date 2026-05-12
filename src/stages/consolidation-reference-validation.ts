import type { MemoryReference } from "../core/types.js";

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
  _options: ValidationOptions,
): { ok: true } | { ok: false; message: string } {
  if (!references.length) {
    return { ok: false, message: "At least one valid reference is required." };
  }

  for (const reference of references) {
    if (
      !reference.kind ||
      !reference.value ||
      reference.value.trim().length === 0
    ) {
      return {
        ok: false,
        message: "Each reference must include kind and non-empty value.",
      };
    }
    if (reference.kind === "url") {
      if (!validateUrlBestEffort(reference.value)) {
        return {
          ok: false,
          message: `Invalid URL reference: ${reference.value}`,
        };
      }
    }
  }

  return { ok: true };
}
