import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Honcho, type ConclusionCreateParams, type HonchoConfig } from "@honcho-ai/sdk";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

type MemoryScope = MemoryRecord["scope"];

type HonchoSnapshot = {
  version: string;
  syncedAt: string;
  workspaceDir: string;
  workspaceId: string;
  sessionId: string;
  records: MemoryRecord[];
  counts: Record<MemoryScope, number>;
};

type HonchoExport = HonchoSnapshot & {
  peers: Array<{ id: string; role: string; scope?: MemoryScope }>;
};

type HonchoPageLike<T> = {
  items: T[];
  getNextPage?: () => Promise<HonchoPageLike<T> | null>;
};

type HonchoConclusionLike = {
  id: string;
  content: string;
  sessionId: string | null;
  createdAt: string;
};

type HonchoConclusionScopeLike = {
  list: (options?: { page?: number; size?: number; reverse?: boolean }) => Promise<HonchoPageLike<HonchoConclusionLike>>;
  create: (conclusions: ConclusionCreateParams | ConclusionCreateParams[]) => Promise<unknown>;
  delete: (conclusionId: string) => Promise<void>;
};

type HonchoPeerLike = {
  id: string;
  getMetadata: () => Promise<Record<string, unknown>>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  conclusions: HonchoConclusionScopeLike;
  conclusionsOf: (target: string | HonchoPeerLike) => HonchoConclusionScopeLike;
};

type HonchoSessionLike = {
  id: string;
  addPeers: (peers: unknown) => Promise<void>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
};

type HonchoClientLike = {
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

const DREAMER_METADATA_KEY = "dreamer";
const SNAPSHOT_VERSION = "2";
const DREAMER_PEER_ID = "dreamer";
const SCOPE_PEERS: Record<MemoryScope, string> = {
  user: "dreamer-user",
  workspace: "dreamer-workspace",
  session: "dreamer-session"
};

function defaultWorkspaceId(workspaceDir: string): string {
  const candidate = basename(workspaceDir).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return candidate.length > 0 ? candidate : "dreamer";
}

function isMemoryRecordArray(value: unknown): value is MemoryRecord[] {
  return Array.isArray(value);
}

function isMemoryScope(value: unknown): value is MemoryScope {
  return value === "user" || value === "workspace" || value === "session";
}

function parseSnapshot(value: unknown): HonchoSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SNAPSHOT_VERSION) return null;
  if (typeof record.syncedAt !== "string") return null;
  if (typeof record.workspaceDir !== "string") return null;
  if (typeof record.workspaceId !== "string") return null;
  if (typeof record.sessionId !== "string") return null;
  if (!isMemoryRecordArray(record.records)) return null;
  const counts = record.counts as Record<string, unknown> | undefined;
  if (!counts) return null;
  if (!["user", "workspace", "session"].every((scope) => typeof counts[scope] === "number")) return null;
  return {
    version: SNAPSHOT_VERSION,
    syncedAt: record.syncedAt,
    workspaceDir: record.workspaceDir,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    records: record.records,
    counts: {
      user: Number(counts.user),
      workspace: Number(counts.workspace),
      session: Number(counts.session)
    }
  };
}

function buildSnapshot(workspaceDir: string, workspaceId: string, sessionId: string, records: MemoryRecord[]): HonchoSnapshot {
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

function parseLegacyExport(value: unknown): MemoryRecord[] | null {
  if (Array.isArray(value)) return value as MemoryRecord[];
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.records)) return record.records as MemoryRecord[];
  if (Array.isArray(record.memory)) return record.memory as MemoryRecord[];
  return null;
}

function toConclusionContent(record: MemoryRecord): string {
  const payload = {
    id: record.id,
    scope: record.scope,
    statement: record.statement,
    confidence: record.confidence,
    contradictoryTo: record.contradictoryTo,
    provenance: record.provenance
  };
  return JSON.stringify(payload);
}

async function listAllConclusions(scope: HonchoConclusionScopeLike): Promise<HonchoConclusionLike[]> {
  const collected: HonchoConclusionLike[] = [];
  let page = await scope.list({ page: 1, size: 100, reverse: true });
  while (true) {
    collected.push(...page.items);
    if (typeof page.getNextPage !== "function") break;
    const nextPage = await page.getNextPage();
    if (!nextPage) break;
    page = nextPage;
  }
  return collected;
}

export class HonchoMemoryBackend implements MemoryBackend {
  readonly id = "backend.honcho.memory";
  private readonly workspaceDir: string;
  private readonly workspaceId: string;
  private readonly exportPath: string;
  private readonly clientConfig: HonchoConfig;
  private readonly createClient: (config: HonchoConfig) => HonchoClientLike;
  private client?: HonchoClientLike;

  constructor(workspaceDir: string, options?: string | HonchoMemoryBackendOptions) {
    const resolvedOptions = typeof options === "string" ? { exportPath: options } : options;
    this.workspaceDir = workspaceDir;
    this.workspaceId = resolvedOptions?.workspaceId ?? defaultWorkspaceId(workspaceDir);
    this.exportPath = resolvedOptions?.exportPath ?? join(workspaceDir, ".dreamer", "honcho", "workspace.json");
    this.clientConfig = {
      workspaceId: this.workspaceId,
      apiKey: resolvedOptions?.apiKey,
      baseURL: resolvedOptions?.baseURL,
      environment: resolvedOptions?.environment
    };
    this.createClient = resolvedOptions?.createClient ?? ((config) => new Honcho(config));
  }

  async load(): Promise<MemoryRecord[]> {
    const snapshot = parseSnapshot((await this.getClient().getMetadata())[DREAMER_METADATA_KEY]);
    if (snapshot) {
      await this.writeExport(snapshot);
      return snapshot.records;
    }

    return this.readLocalFallback();
  }

  async save(records: MemoryRecord[]): Promise<void> {
    const client = await this.getClient();
    const planner = await this.ensurePeer(client, DREAMER_PEER_ID, { role: "planner", managedBy: "dreamer" });
    const scopePeers = await Promise.all(
      Object.entries(SCOPE_PEERS).map(async ([scope, peerId]) => [
        scope,
        await this.ensurePeer(client, peerId, { role: "memory-scope", scope, managedBy: "dreamer" })
      ])
    );

    const sessionId = `dreamer-sync-${Date.now()}`;
    const snapshot = buildSnapshot(this.workspaceDir, client.workspaceId, sessionId, records);
    const session = await client.session(sessionId, {
      metadata: {
        kind: "dreamer-memory-sync",
        workspaceDir: this.workspaceDir,
        syncedAt: snapshot.syncedAt,
        recordCount: records.length
      },
      configuration: {
        reasoning: { enabled: false },
        summary: { enabled: false },
        peerCard: { use: false, create: false },
        dream: { enabled: false }
      }
    });
    await session.addPeers([planner, ...scopePeers.map(([, peer]) => peer)]);
    await session.setMetadata({
      kind: "dreamer-memory-sync",
      syncedAt: snapshot.syncedAt,
      workspaceDir: this.workspaceDir,
      recordCount: records.length,
      snapshot
    });

    for (const [, peer] of scopePeers) {
      const conclusions = await listAllConclusions(planner.conclusionsOf(peer));
      await Promise.all(conclusions.map((conclusion) => planner.conclusionsOf(peer).delete(conclusion.id)));
    }

    const scopedRecords = new Map<MemoryScope, MemoryRecord[]>();
    for (const record of records) {
      if (!isMemoryScope(record.scope)) continue;
      const existing = scopedRecords.get(record.scope) ?? [];
      existing.push(record);
      scopedRecords.set(record.scope, existing);
    }

    for (const [scope, peer] of scopePeers) {
      const recordsForScope = scopedRecords.get(scope as MemoryScope) ?? [];
      if (!recordsForScope.length) continue;
      await planner.conclusionsOf(peer).create(
        recordsForScope.map((record) => ({ content: toConclusionContent(record), sessionId }))
      );
    }

    const currentMetadata = await client.getMetadata();
    await client.setMetadata({
      ...currentMetadata,
      [DREAMER_METADATA_KEY]: snapshot
    });

    const payload: HonchoExport = {
      ...snapshot,
      peers: [{ id: planner.id, role: "planner" }].concat(
        scopePeers.map(([scope, peer]) => ({ id: peer.id, role: "memory-scope", scope: scope as MemoryScope }))
      )
    };
    await this.writeExport(payload);
  }

  private async getClient(): Promise<HonchoClientLike> {
    if (!this.client) this.client = this.createClient(this.clientConfig);
    return this.client;
  }

  private async ensurePeer(client: HonchoClientLike, id: string, metadata: Record<string, unknown>): Promise<HonchoPeerLike> {
    const peer = await client.peer(id, {
      configuration: { observeMe: false },
      metadata
    });
    const currentMetadata = await peer.getMetadata();
    await peer.setMetadata({ ...currentMetadata, ...metadata });
    return peer;
  }

  private async readLocalFallback(): Promise<MemoryRecord[]> {
    try {
      const raw = await readFile(this.exportPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const snapshot = parseSnapshot(parsed);
      if (snapshot) return snapshot.records;
      return parseLegacyExport(parsed) ?? [];
    } catch {
      return [];
    }
  }

  private async writeExport(payload: HonchoSnapshot | HonchoExport): Promise<void> {
    await mkdir(dirname(this.exportPath), { recursive: true });
    await writeFile(this.exportPath, JSON.stringify(payload, null, 2), "utf8");
  }
}
