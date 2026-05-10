import type { ToolResultObject } from "@github/copilot-sdk";

function scanShellIds(value: unknown, ids: Set<string>): void {
  if (typeof value === "string") {
    const patterns = [
      /\bshellId\b\s*[:=]\s*["']?([A-Za-z0-9._:-]+)/g,
      /\bshell ID\b\s*[:=]\s*["']?([A-Za-z0-9._:-]+)/gi
    ];
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        if (match[1]) ids.add(match[1].trim());
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => scanShellIds(item, ids));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, field] of Object.entries(value)) {
    if (key === "shellId" && typeof field === "string" && field.trim()) ids.add(field.trim());
    else scanShellIds(field, ids);
  }
}

export function extractReturnedShellIds(result: ToolResultObject): Set<string> {
  const ids = new Set<string>();
  scanShellIds(result, ids);
  return ids;
}
