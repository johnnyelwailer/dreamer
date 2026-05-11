import type { PermissionRequest } from "@github/copilot-sdk";

type PermissionRequestRecord = PermissionRequest & { toolName?: string };

export function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function readStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

export function permissionToolName(request: PermissionRequest): string | undefined {
  const record = request as PermissionRequestRecord;
  if (typeof record.toolName === "string" && record.toolName.trim()) return record.toolName.trim();
  if (request.kind === "shell") return "bash";
  if (request.kind === "read") return "read_file";
  return undefined;
}