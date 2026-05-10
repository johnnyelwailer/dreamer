import { describeFetchError } from "./fetch-error-details.js";

export async function preflightProvider(baseUrl?: string): Promise<string | undefined> {
  if (!baseUrl) return undefined;
  try {
    // Reachability check only: status code is not used for pass/fail.
    await fetch(baseUrl, { method: "GET", signal: AbortSignal.timeout(6000) });
    return undefined;
  } catch (error) {
    return describeFetchError(error);
  }
}

export function isEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}