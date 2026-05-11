export function summarize(text: string, max = 96): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(0, max - 3))}...`;
}

export function summarizeTask(toolName: string, argsPreview: string): string {
  if (!argsPreview.trim()) return `${toolName} in progress`;
  return summarize(`${toolName}: ${argsPreview}`, 96);
}

export function summarizeEventPayload(data: Record<string, unknown> | undefined): string {
  if (!data) return "";
  const candidates: unknown[] = [
    data.content,
    data.message,
    data.summary,
    data.reason,
    data.status,
    (data.result as Record<string, unknown> | undefined)?.summary,
    (data.result as Record<string, unknown> | undefined)?.message
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return summarize(candidate, 120);
    }
  }
  return "";
}

export function summarizeDelegationPreview(preview: string | undefined): string | undefined {
  if (!preview?.trim()) return undefined;
  const description = previewValue(preview, "description");
  if (description?.trim()) return summarize(description, 96);
  const name = previewValue(preview, "name");
  if (name?.trim()) return summarize(name, 96);
  return summarize(preview, 96);
}

export function previewValue(preview: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = preview.match(new RegExp(`(?:^|\\s)${escaped}=("(?:[^"\\\\]|\\\\.)*"|\\S+)`));
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  if (!raw.startsWith("\"")) return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return raw.slice(1, -1);
  }
}

export function activityTitleFromArgs(preview: string | undefined): string | undefined {
  if (!preview?.trim()) return undefined;
  const description = previewValue(preview, "description");
  return description?.trim() ? summarize(description, 96) : undefined;
}

export function extractDelegationDescription(data: Record<string, unknown> | undefined, previewFallback: string | undefined): string | undefined {
  // Try to read description/name directly from raw args object (before any truncation)
  if (data) {
    const candidates = [data.arguments, data.args, data.parameters, data.input, data.toolInput];
    for (const candidate of candidates) {
      let obj = candidate;
      if (typeof obj === "string") {
        try { obj = JSON.parse(obj) as unknown; } catch { continue; }
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const record = obj as Record<string, unknown>;
        const desc = typeof record.description === "string" ? record.description.trim() : undefined;
        if (desc) return summarize(desc, 96);
        const name = typeof record.name === "string" ? record.name.trim() : undefined;
        if (name) return summarize(name, 96);
      }
    }
    if (typeof data.description === "string" && data.description.trim()) return summarize(data.description.trim(), 96);
    if (typeof data.name === "string" && data.name.trim()) return summarize(data.name.trim(), 96);
  }
  return summarizeDelegationPreview(previewFallback);
}
