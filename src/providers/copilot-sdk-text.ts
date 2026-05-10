export const COPILOT_SDK_PROVIDER_NO_SUMMARY = "No summary returned.";
export const COPILOT_SDK_PROVIDER_REQUEST_FAILED = "Copilot SDK provider request failed.";

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).join("\n");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(value);
}

export function extractAssistantText(response: unknown): string {
  const record = response as Record<string, unknown>;
  const data = record?.data as Record<string, unknown> | undefined;
  const content = data?.content;
  if (content) return normalizeText(content).trim();
  return normalizeText(response).trim();
}
