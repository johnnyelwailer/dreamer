import type { ConclusionCreateParams, HonchoConfig } from "@honcho-ai/sdk";
import type { MemoryRecord } from "../core/types.js";

export type MemoryScope = MemoryRecord["scope"];

export type HonchoSnapshot = {
  version: string;
  syncedAt: string;
  workspaceDir: string;
  workspaceId: string;
  sessionId: string;
  records: MemoryRecord[];
  counts: Record<MemoryScope, number>;
};

export type HonchoExport = HonchoSnapshot & {
  peers: Array<{ id: string; role: string; scope?: MemoryScope }>;
};

export type HonchoPageLike<T> = {
  items: T[];
  getNextPage?: () => Promise<HonchoPageLike<T> | null>;
};

export type HonchoConclusionLike = {
  id: string;
  content: string;
  sessionId: string | null;
  createdAt: string;
};

export type HonchoConclusionScopeLike = {
  list: (options?: { page?: number; size?: number; reverse?: boolean }) => Promise<HonchoPageLike<HonchoConclusionLike>>;
  create: (conclusions: ConclusionCreateParams | ConclusionCreateParams[]) => Promise<unknown>;
  delete: (conclusionId: string) => Promise<void>;
};

export type HonchoPeerLike = {
  id: string;
  getMetadata: () => Promise<Record<string, unknown>>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  conclusions: HonchoConclusionScopeLike;
  conclusionsOf: (target: string | HonchoPeerLike) => HonchoConclusionScopeLike;
};

export type HonchoSessionLike = {
  id: string;
  addPeers: (peers: unknown) => Promise<void>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
};

export type HonchoClientLike = {
  workspaceId: string;
  getMetadata: () => Promise<Record<string, unknown>>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  peer: (
    id: string,
    options?: { metadata?: Record<string, unknown>; configuration?: { observeMe?: boolean | null } }
  ) => Promise<HonchoPeerLike>;
  session: (
    id: string,
    options?: { metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }
  ) => Promise<HonchoSessionLike>;
};

export type HonchoMemoryBackendOptions = {
  workspaceId?: string;
  apiKey?: string;
  baseURL?: string;
  environment?: HonchoConfig["environment"];
  exportPath?: string;
  createClient?: (config: HonchoConfig) => HonchoClientLike;
};

export const DREAMER_METADATA_KEY = "dreamer";
export const SNAPSHOT_VERSION = "2";
export const DREAMER_PEER_ID = "dreamer";
export const SCOPE_PEERS: Record<MemoryScope, string> = {
  user: "dreamer-user",
  workspace: "dreamer-workspace",
  session: "dreamer-session"
};

export function isMemoryScope(value: unknown): value is MemoryScope {
  return value === "user" || value === "workspace" || value === "session";
}

export function parseSnapshot(value: unknown): HonchoSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const counts = record.counts as Record<string, unknown> | undefined;
  if (!counts || record.version !== SNAPSHOT_VERSION || typeof record.syncedAt !== "string") return null;
  if (typeof record.workspaceDir !== "string" || typeof record.workspaceId !== "string") return null;
  if (typeof record.sessionId !== "string" || !Array.isArray(record.records)) return null;
  if (!["user", "workspace", "session"].some((scope) => typeof counts[scope] !== "number")) return null;
  return record as HonchoSnapshot;
}

export function buildSnapshot(workspaceDir: string, workspaceId: string, sessionId: string, records: MemoryRecord[]): HonchoSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    syncedAt: new Date().toISOString(),
    workspaceDir,
    workspaceId,
    sessionId,
    records,
    counts: {
      user: records.filter((record) => record.scope === "user").length,
      workspace: records.filter((record) => record.scope === "workspace").length,
      session: records.filter((record) => record.scope === "session").length
    }
  };
}

export function parseLegacyExport(value: unknown): MemoryRecord[] | null {
  if (Array.isArray(value)) return value as MemoryRecord[];
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.records)) return record.records as MemoryRecord[];
  if (Array.isArray(record.memory)) return record.memory as MemoryRecord[];
  return null;
}

export function toConclusionContent(record: MemoryRecord): string {
  return JSON.stringify({
    id: record.id,
    scope: record.scope,
    statement: record.statement,
    confidence: record.confidence,
    contradictoryTo: record.contradictoryTo,
    provenance: record.provenance
  });
}
