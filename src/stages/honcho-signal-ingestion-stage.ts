import { Honcho, type HonchoConfig } from "@honcho-ai/sdk";
import type { PipelineStage, StageImplementation, StageImplementationInput, StageImplementationResult } from "../core/contracts.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import { defaultWorkspaceId } from "../backends/honcho-memory-shared.js";
import { ttyWriteTagged } from "../shared/tty-log-format.js";

type HonchoMessageInput = {
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

type HonchoIngestionPeer = { id: string };
type HonchoIngestionSession = {
  id: string;
  addPeers: (peers: unknown) => Promise<void>;
  addMessages: (messages: HonchoMessageInput | HonchoMessageInput[]) => Promise<unknown>;
  setMetadata: (metadata: Record<string, unknown>) => Promise<void>;
};
type HonchoIngestionClient = {
  workspaceId: string;
  peer: (id: string, options?: { metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }) => Promise<HonchoIngestionPeer>;
  session: (id: string, options?: { metadata?: Record<string, unknown>; configuration?: Record<string, unknown> }) => Promise<HonchoIngestionSession>;
};

export type HonchoSignalIngestionOptions = {
  workspaceId?: string;
  apiKey?: string;
  baseURL?: string;
  environment?: HonchoConfig["environment"];
  createClient?: (config: HonchoConfig) => HonchoIngestionClient;
};

const SIGNAL_PEER_ID = "signal-recorder";
const HONCHO_MESSAGE_BATCH_SIZE = 100;

export class HonchoSignalIngestionImplementation implements StageImplementation {
  readonly id = "impl.signal.local-honcho-ingest";
  readonly slots = ["slot.signal"];
  readonly exportsData = true;
  private readonly clientConfig: HonchoConfig;
  private readonly createClient: (config: HonchoConfig) => HonchoIngestionClient;

  constructor(private readonly localSignalStage: PipelineStage, workspaceDir: string, options: HonchoSignalIngestionOptions = {}) {
    this.clientConfig = {
      workspaceId: options.workspaceId ?? defaultWorkspaceId(workspaceDir),
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      environment: options.environment
    };
    this.createClient = options.createClient ?? ((config) => new Honcho(config) as unknown as HonchoIngestionClient);
  }

  async run(input: StageImplementationInput): Promise<StageImplementationResult> {
    const context = await this.localSignalStage.run(input.context);
    await this.ingest(context);
    return { context };
  }

  private async ingest(context: DreamContext): Promise<void> {
    if (context.insights.length === 0) {
      context.diary.push("honcho:signal_insights_skipped insights=0");
      ttyWriteTagged("dream", "honcho signal ingestion skipped insights=0");
      return;
    }
    const client = this.createClient(this.clientConfig);
    const sessionId = `signal-${context.runId}`;
    const signalPeer = await client.peer(SIGNAL_PEER_ID, { metadata: { role: "signal-recorder" } });
    const session = await client.session(sessionId, {
      metadata: { kind: "signal-ingestion", runId: context.runId, workspaceDir: context.workspaceDir },
      configuration: { reasoning: { enabled: true }, summary: { enabled: true }, dream: { enabled: true } }
    });
    await session.addPeers([signalPeer]);
    const insightMessages = context.insights.map((insight, index) => this.insightMessage(context, insight, index));
    for (let index = 0; index < insightMessages.length; index += HONCHO_MESSAGE_BATCH_SIZE) {
      await session.addMessages(insightMessages.slice(index, index + HONCHO_MESSAGE_BATCH_SIZE));
    }
    await session.setMetadata({
      kind: "signal-ingestion",
      runId: context.runId,
      workspaceDir: context.workspaceDir,
      insightCount: insightMessages.length,
      ingestedAt: new Date().toISOString()
    });
    context.diary.push(`honcho:signal_insights_ingested insights=${insightMessages.length}`);
  }

  private insightMessage(context: DreamContext, insight: InsightRecord, index: number): HonchoMessageInput {
    return {
      peerId: SIGNAL_PEER_ID,
      content: insight.statement,
      createdAt: context.nowIso,
      metadata: {
        kind: "signal_insight",
        runId: context.runId,
        index,
        scope: insight.scope,
        context: insight.context,
        evidence: insight.evidence,
        capture: insight.capture
      }
    };
  }
}
