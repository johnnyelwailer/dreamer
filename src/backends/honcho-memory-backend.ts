import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Honcho, type HonchoConfig } from "@honcho-ai/sdk";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";
import { buildSnapshot, defaultWorkspaceId, DREAMER_METADATA_KEY, DREAMER_PEER_ID, type HonchoClientLike, type HonchoConclusionScopeLike, type HonchoExport, type HonchoMemoryBackendOptions, type HonchoPeerLike, type HonchoSnapshot, type MemoryScope, isMemoryScope, parseLegacyExport, parseSnapshot, SCOPE_PEERS, toConclusionContent } from "./honcho-memory-shared.js";

async function listAllConclusions(scope: HonchoConclusionScopeLike) {
  const collected = [];
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
    this.exportPath = resolvedOptions?.exportPath ?? join(workspaceStorageDir(workspaceDir), "honcho", "workspace.json");
    this.clientConfig = {
      workspaceId: this.workspaceId,
      apiKey: resolvedOptions?.apiKey,
      baseURL: resolvedOptions?.baseURL,
      environment: resolvedOptions?.environment
    };
    this.createClient = resolvedOptions?.createClient ?? ((config) => new Honcho(config) as unknown as HonchoClientLike);
  }

  async load(): Promise<MemoryRecord[]> {
    const client = await this.getClient();
    const snapshot = parseSnapshot((await client.getMetadata())[DREAMER_METADATA_KEY]);
    if (snapshot) {
      await this.writeExport(snapshot);
      return snapshot.records;
    }
    return this.readLocalFallback();
  }

  async save(records: MemoryRecord[]): Promise<void> {
    const client = await this.getClient();
    const planner = await this.ensurePeer(client, DREAMER_PEER_ID, { role: "planner", managedBy: "dreamer" });
    const scopePeers = await Promise.all(Object.entries(SCOPE_PEERS).map(async ([scope, peerId]) => {
      const peer = await this.ensurePeer(client, peerId, { role: "memory-scope", scope, managedBy: "dreamer" });
      return [scope as MemoryScope, peer] as const;
    }));

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
    await client.setMetadata({ ...currentMetadata, [DREAMER_METADATA_KEY]: snapshot });
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
    const peer = await client.peer(id, { configuration: { observeMe: false }, metadata });
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
