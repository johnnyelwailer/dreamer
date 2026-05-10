import type { readDreamConfig } from "../dream/config.js";
import { discoverCopilotDebugSessions } from "../dream/copilot-debug-session-discovery.js";

type DreamConfig = ReturnType<typeof readDreamConfig>;

/**
 * Pick a stratified sample: 1 long, 1 medium, 2 short, totalling about 4 sessions.
 * Falls back gracefully when fewer sessions exist.
 */
export function sampleSessionPaths(config: DreamConfig): string[] | undefined {
  if (config.adapterId !== "adapter.copilot.debug") return undefined;
  const sessions = discoverCopilotDebugSessions({
    searchPaths: config.copilotDebugSearchPaths,
    mode: config.copilotDebugDiscoveryMode,
    lookbackDays: config.copilotDebugLookbackDays
  });
  if (sessions.length <= 4) return undefined;
  const sorted = [...sessions].sort((a, b) => a.transcriptLineCount - b.transcriptLineCount);
  const sample = buildStratifiedSessionSample(sorted);
  return sample.map((session) => session.path);
}

type SessionDiscoveryResult = ReturnType<typeof discoverCopilotDebugSessions>[number];

function buildStratifiedSessionSample(sessions: SessionDiscoveryResult[]): SessionDiscoveryResult[] {
  const sample: SessionDiscoveryResult[] = [];
  addUnique(sample, sessions[0]);
  addUnique(sample, sessions[1]);
  addUnique(sample, sessions[Math.floor(sessions.length / 2)]);
  addUnique(sample, sessions[sessions.length - 1]);
  return sample;
}

function addUnique<T>(items: T[], item: T | undefined): void {
  if (item !== undefined && !items.includes(item)) items.push(item);
}
