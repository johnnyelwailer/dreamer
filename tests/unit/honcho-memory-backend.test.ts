import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { HonchoConfig } from "@honcho-ai/sdk";
import { HonchoMemoryBackend } from "../../src/backends/honcho-memory-backend.js";
import type { MemoryRecord } from "../../src/core/types.js";

type FakeConclusion = {
  id: string;
  content: string;
  sessionId: string | null;
  createdAt: string;
};

class FakePage<T> {
  constructor(readonly items: T[]) {}

  async getNextPage(): Promise<null> {
    return null;
  }
}

class FakeConclusionScope {
  constructor(private readonly store: FakeConclusion[]) {}

  async list(): Promise<FakePage<FakeConclusion>> {
    return new FakePage([...this.store]);
  }

  async create(input: { content: string; sessionId?: string } | Array<{ content: string; sessionId?: string }>): Promise<void> {
    const conclusions = Array.isArray(input) ? input : [input];
    for (const conclusion of conclusions) {
      this.store.push({
        id: `c-${this.store.length + 1}`,
        content: conclusion.content,
        sessionId: conclusion.sessionId ?? null,
        createdAt: new Date().toISOString()
      });
    }
  }

  async delete(conclusionId: string): Promise<void> {
    const index = this.store.findIndex((conclusion) => conclusion.id === conclusionId);
    if (index >= 0) this.store.splice(index, 1);
  }
}

class FakePeer {
  readonly metadata: Record<string, unknown>;
  readonly scopes = new Map<string, FakeConclusionScope>();
  readonly selfConclusions = new FakeConclusionScope([]);

  constructor(readonly id: string, metadata: Record<string, unknown> = {}) {
    this.metadata = { ...metadata };
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    return { ...this.metadata };
  }

  async setMetadata(metadata: Record<string, unknown>): Promise<void> {
    Object.assign(this.metadata, metadata);
  }

  get conclusions(): FakeConclusionScope {
    return this.selfConclusions;
  }

  conclusionsOf(target: string | FakePeer): FakeConclusionScope {
    const targetId = typeof target === "string" ? target : target.id;
    const existing = this.scopes.get(targetId);
    if (existing) return existing;
    const created = new FakeConclusionScope([]);
    this.scopes.set(targetId, created);
    return created;
  }
}

class FakeSession {
  readonly peersAdded: string[] = [];
  metadata: Record<string, unknown> = {};

  constructor(readonly id: string) {}

  async addPeers(peers: Array<FakePeer | string>): Promise<void> {
    this.peersAdded.push(...peers.map((peer) => (typeof peer === "string" ? peer : peer.id)));
  }

  async setMetadata(metadata: Record<string, unknown>): Promise<void> {
    this.metadata = { ...metadata };
  }
}

class FakeHonchoClient {
  readonly workspaceId: string;
  metadata: Record<string, unknown> = {};
  readonly peers = new Map<string, FakePeer>();
  readonly sessions = new Map<string, FakeSession>();

  constructor(config: HonchoConfig) {
    this.workspaceId = config.workspaceId ?? "default";
  }

  async getMetadata(): Promise<Record<string, unknown>> {
    return { ...this.metadata };
  }

  async setMetadata(metadata: Record<string, unknown>): Promise<void> {
    this.metadata = { ...metadata };
  }

  async peer(
    id: string,
    options?: { metadata?: Record<string, unknown>; configuration?: { observeMe?: boolean | null } }
  ): Promise<FakePeer> {
    const existing = this.peers.get(id);
    if (existing) {
      if (options?.metadata) Object.assign(existing.metadata, options.metadata);
      return existing;
    }
    const peer = new FakePeer(id, options?.metadata);
    this.peers.set(id, peer);
    return peer;
  }

  async session(id: string): Promise<FakeSession> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const session = new FakeSession(id);
    this.sessions.set(id, session);
    return session;
  }
}

const memory: MemoryRecord[] = [
  {
    id: "m-1",
    scope: "workspace",
    statement: "Use unit tests before refactors",
    confidence: 0.9,
    provenance: {
      source: "test",
      eventIds: ["e-1"],
      capturedAt: "2026-01-01T00:00:00.000Z"
    }
  },
  {
    id: "m-2",
    scope: "user",
    statement: "Prefers small reversible edits",
    confidence: 0.8,
    provenance: {
      source: "test",
      eventIds: ["e-2"],
      capturedAt: "2026-01-02T00:00:00.000Z"
    },
    contradictoryTo: "m-9"
  }
];

describe("HonchoMemoryBackend", () => {
  afterEach(async () => {
    await rm(".dreamer/test/honcho-sdk-export.json", { force: true });
  });

  it("stores exact records in Honcho metadata and publishes scoped conclusions", async () => {
    const client = new FakeHonchoClient({ workspaceId: "dreamer-test" });
    const backend = new HonchoMemoryBackend(process.cwd(), {
      workspaceId: "dreamer-test",
      exportPath: ".dreamer/test/honcho-sdk-export.json",
      createClient: () => client
    });

    await backend.save(memory);

    const loaded = await backend.load();
    expect(loaded).toEqual(memory);

    const snapshot = client.metadata.dreamer as Record<string, unknown>;
    expect(snapshot.workspaceId).toBe("dreamer-test");
    expect(snapshot.records).toEqual(memory);

    const planner = client.peers.get("dreamer");
    expect(planner).toBeDefined();
    expect(client.peers.get("dreamer-user")?.metadata.scope).toBe("user");
    expect(client.peers.get("dreamer-workspace")?.metadata.scope).toBe("workspace");

    const workspaceConclusions = planner?.conclusionsOf("dreamer-workspace");
    const userConclusions = planner?.conclusionsOf("dreamer-user");
    expect((await workspaceConclusions?.list())?.items).toHaveLength(1);
    expect((await userConclusions?.list())?.items).toHaveLength(1);

    const session = [...client.sessions.values()][0];
    expect(session.peersAdded.sort()).toEqual(["dreamer", "dreamer-session", "dreamer-user", "dreamer-workspace"].sort());
    expect((session.metadata.snapshot as Record<string, unknown>).records).toEqual(memory);
  });

  it("falls back to the local export when Honcho metadata is empty", async () => {
    const writerClient = new FakeHonchoClient({ workspaceId: "dreamer-test" });
    const exportPath = ".dreamer/test/honcho-sdk-export.json";
    const writer = new HonchoMemoryBackend(process.cwd(), {
      workspaceId: "dreamer-test",
      exportPath,
      createClient: () => writerClient
    });

    await writer.save(memory);

    const emptyClient = new FakeHonchoClient({ workspaceId: "dreamer-test" });
    const reader = new HonchoMemoryBackend(process.cwd(), {
      workspaceId: "dreamer-test",
      exportPath,
      createClient: () => emptyClient
    });

    await expect(reader.load()).resolves.toEqual(memory);
  });
});
