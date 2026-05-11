function asEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value as T;
}

function asPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid runtime manifest field: ${field}`);
  }
  return value;
}

export function parseDiscoverySource(
  value: unknown,
  field: string
): {
  mode: "append" | "override";
  searchPaths: string[];
  lookbackDays?: number;
  maxSessionsPerRun?: number;
} | undefined {
  if (value === undefined) return undefined;
  const source = value as Record<string, unknown>;
  return {
    mode: source.mode ? asEnum(source.mode, ["append", "override"] as const, `${field}.mode`) : "append",
    searchPaths: source.searchPaths ? asStringArray(source.searchPaths, `${field}.searchPaths`) : [],
    lookbackDays:
      source.lookbackDays === undefined
        ? undefined
        : asPositiveNumber(source.lookbackDays, `${field}.lookbackDays`),
    maxSessionsPerRun:
      source.maxSessionsPerRun === undefined
        ? undefined
        : asPositiveInteger(source.maxSessionsPerRun, `${field}.maxSessionsPerRun`)
  };
}
