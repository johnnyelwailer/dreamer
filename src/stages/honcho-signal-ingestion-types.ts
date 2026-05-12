import type { HonchoConfig } from "@honcho-ai/sdk";
import type { SessionNamer } from "../core/session-naming.js";

export type HonchoConclusionInput = { content: string; sessionId?: string };

export type HonchoConclusionScope = {
  create: (conclusions: HonchoConclusionInput | HonchoConclusionInput[]) => Promise<unknown>;
};

export type HonchoIngestionPeer = {
  id: string;
  conclusionsOf: (target: string | { id: string }) => HonchoConclusionScope;
};

export type HonchoMessageInput = {
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type HonchoIngestionSession = {
  id: string;
  addPeers?: (peers: string[] | Array<{ id: string }>) => Promise<unknown>;
  addMessages: (messages: HonchoMessageInput | HonchoMessageInput[]) => Promise<unknown>;
  setMetadata?: (metadata: Record<string, unknown>) => Promise<unknown>;
};

export type HonchoIngestionClient = {
  workspaceId: string;
  peer: (id: string, options?: { metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }) => Promise<HonchoIngestionPeer>;
  session?: (id: string) => Promise<HonchoIngestionSession>;
};

export type HonchoSignalFlushMode = "startup" | "live" | "session" | "final";

export type HonchoSignalIngestionOptions = {
  workspaceId?: string;
  apiKey?: string;
  baseURL?: string;
  environment?: HonchoConfig["environment"];
  liveBatchSize?: number;
  sessionNamer?: SessionNamer;
  createClient?: (config: HonchoConfig) => HonchoIngestionClient;
};

export function resolveLiveBatchSize(value: number | undefined): number {
  const raw = value ?? Number(process.env.DREAM_HONCHO_SIGNAL_BATCH_SIZE ?? "3");
  return Math.max(1, Math.min(Number.isFinite(raw) ? raw : 3, 100));
}
