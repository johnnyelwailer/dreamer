import { Honcho, type HonchoConfig } from "@honcho-ai/sdk";
import type { PipelineStage, StageImplementation, StageImplementationInput, StageImplementationResult } from "../core/contracts.js";
import type { DreamContext, InsightRecord, NormalizedEvent } from "../core/types.js";
import { defaultWorkspaceId, repoScopedSessionId } from "../backends/honcho-memory-shared.js";
import { ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildSignalAttribution, honchoSafePeerId, type SignalAttribution } from "./honcho-signal-ingestion-format.js";
import { resolveLiveBatchSize, type HonchoConclusionInput, type HonchoIngestionClient, type HonchoIngestionPeer, type HonchoMessageInput, type HonchoSignalFlushMode, type HonchoSignalIngestionOptions } from "./honcho-signal-ingestion-types.js";
export type { HonchoSignalIngestionOptions } from "./honcho-signal-ingestion-types.js";

const SIGNAL_PEER_ID = "signal-recorder";
const RAW_USER_PEER_ID = "user";
const RAW_ASSISTANT_PEER_ID = "assistant";
const RAW_SYSTEM_PEER_ID = "system";
const HONCHO_MESSAGE_BATCH_SIZE = 100;
const MAX_RAW_EVENT_CONTENT_CHARS = 1200;
const MAX_TOOL_SUMMARY_ITEMS = 12;

export class HonchoRawSignalIngestionImplementation implements StageImplementation {
  readonly id = "impl.signal.honcho-raw";
  readonly slots = ["slot.signal"];
  readonly exportsData = true;
  private readonly clientConfig: HonchoConfig;
  private readonly createClient: (config: HonchoConfig) => HonchoIngestionClient;
  private readonly attribution: SignalAttribution;

  constructor(workspaceDir: string, options: HonchoSignalIngestionOptions = {}) {
    const workspaceId = options.workspaceId ?? defaultWorkspaceId(workspaceDir);
    this.clientConfig = {
      workspaceId,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      environment: options.environment
    };
    this.createClient = options.createClient ?? ((config) => new Honcho(config) as unknown as HonchoIngestionClient);
    this.attribution = buildSignalAttribution(workspaceDir, workspaceId);
  }

  async run(input: StageImplementationInput): Promise<StageImplementationResult> {
    const session = groupRawEventsForRepo(input.context.events, this.attribution, input.context.runId);
    if (session.messages.length === 0) {
      input.context.diary.push("honcho:raw_sessions_skipped sessions=0 events=0");
      ttyWriteTagged("dream", "honcho raw ingestion skipped sessions=0 events=0");
      return { context: input.context };
    }

    const client = this.createClient(this.clientConfig);
    if (!client.session) throw new Error("Honcho client does not support session ingestion");

    let messageCount = 0;
    const honchoSession = await client.session(session.id);
    await honchoSession.addPeers?.([RAW_USER_PEER_ID, RAW_ASSISTANT_PEER_ID, RAW_SYSTEM_PEER_ID]);
    for (let index = 0; index < session.messages.length; index += HONCHO_MESSAGE_BATCH_SIZE) {
      const batch = session.messages.slice(index, index + HONCHO_MESSAGE_BATCH_SIZE);
      await honchoSession.addMessages(batch);
      messageCount += batch.length;
    }
    await honchoSession.setMetadata?.({
      kind: "raw-transcript-ingestion",
      runId: input.context.runId,
      workspaceId: this.attribution.workspaceId,
      repoName: this.attribution.repoName,
      sourceSessionIds: session.sourceSessionIds,
      eventCount: session.messages.length
    });

    input.context.diary.push(`honcho:raw_sessions_ingested sessions=1 events=${messageCount}`);
    ttyWriteTagged("dream", `honcho raw sessions ingested sessions=1 events=${messageCount}`);
    return { context: input.context };
  }
}

export class HonchoSignalIngestionImplementation implements StageImplementation {
  readonly id = "impl.signal.local-honcho-ingest";
  readonly slots = ["slot.signal"];
  readonly exportsData = true;
  private readonly clientConfig: HonchoConfig;
  private readonly createClient: (config: HonchoConfig) => HonchoIngestionClient;
  private readonly attribution: SignalAttribution;
  private readonly signalSessionId: string;
  private readonly liveBatchSize: number;
  private pendingInsights: InsightRecord[] = [];
  private recordedInsights: InsightRecord[] = [];
  private syncedInsightCount = 0;
  private client?: HonchoIngestionClient;
  private observer?: HonchoIngestionPeer;
  private signalSessionReady = false;
  private queue: Promise<void> = Promise.resolve();
  private queueError: unknown;
  private completed = false;

  constructor(private readonly localSignalStage: PipelineStage, workspaceDir: string, options: HonchoSignalIngestionOptions = {}) {
    const workspaceId = options.workspaceId ?? defaultWorkspaceId(workspaceDir);
    this.clientConfig = {
      workspaceId,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      environment: options.environment
    };
    this.createClient = options.createClient ?? ((config) => new Honcho(config) as unknown as HonchoIngestionClient);
    this.liveBatchSize = resolveLiveBatchSize(options.liveBatchSize);
    this.attribution = buildSignalAttribution(workspaceDir, workspaceId);
    this.signalSessionId = repoScopedSessionId("signal", workspaceDir);
  }

  async run(input: StageImplementationInput): Promise<StageImplementationResult> {
    this.begin();
    this.recordExistingInsights(input.context);
    await this.flushPending(input.context, "startup");
    const context = await this.localSignalStage.run(input.context);
    await this.complete(context);
    return { context };
  }

  begin(): void {
    this.pendingInsights = [];
    this.recordedInsights = [];
    this.syncedInsightCount = 0;
    this.client = undefined;
    this.observer = undefined;
    this.signalSessionReady = false;
    this.queue = Promise.resolve();
    this.queueError = undefined;
    this.completed = false;
  }

  recordInsight(context: DreamContext, insight: InsightRecord): void {
    this.recordedInsights.push(insight);
    this.pendingInsights.push(insight);
    if (this.pendingInsights.length >= this.liveBatchSize) this.enqueueFlush(context, "live");
  }

  private recordExistingInsights(context: DreamContext): void {
    this.recordedInsights.push(...context.insights);
    this.pendingInsights.push(...context.insights);
  }

  async flushPending(context: DreamContext, mode: HonchoSignalFlushMode): Promise<void> {
    this.enqueueFlush(context, mode);
    await this.queue;
    if (this.queueError) throw this.queueError;
  }

  async complete(context: DreamContext): Promise<void> {
    if (this.completed) return;
    this.completed = true;
    if (this.recordedInsights.length === 0 && context.insights.length > 0) {
      this.pendingInsights.push(...context.insights);
      this.recordedInsights.push(...context.insights);
    }
    await this.flushPending(context, "final");
    if (this.recordedInsights.length === 0) {
      context.diary.push("honcho:signal_insights_skipped insights=0");
      ttyWriteTagged("dream", "honcho signal ingestion skipped insights=0");
      return;
    }
    context.diary.push(`honcho:signal_insights_ingested insights=${this.syncedInsightCount}`);
  }

  private enqueueFlush(context: DreamContext, mode: HonchoSignalFlushMode): void {
    const insights = this.pendingInsights.splice(0);
    if (insights.length === 0) return;
    this.queue = this.queue
      .then(() => this.flushInsights(context, insights, mode))
      .catch((error) => {
        this.queueError = error;
      });
  }

  private async flushInsights(context: DreamContext, insights: InsightRecord[], mode: HonchoSignalFlushMode): Promise<void> {
    const observer = await this.requireObserver();
    await this.ensureSignalSession(context);
    const byTarget = groupConclusionsByTarget(insights, this.attribution);
    for (const [target, conclusions] of byTarget) {
      for (let index = 0; index < conclusions.length; index += HONCHO_MESSAGE_BATCH_SIZE) {
        await observer.conclusionsOf(target).create(
          conclusions.slice(index, index + HONCHO_MESSAGE_BATCH_SIZE).map((conclusion) => ({
            ...conclusion,
            sessionId: this.signalSessionId
          }))
        );
      }
    }
    this.syncedInsightCount += insights.length;
    context.diary.push(`honcho:signal_conclusions_synced=${insights.length}:mode=${mode}`);
    ttyWriteTagged("dream", `honcho conclusions synced insights=${insights.length} total=${this.syncedInsightCount} mode=${mode}`);
  }

  private async requireObserver(): Promise<HonchoIngestionPeer> {
    if (this.observer) return this.observer;
    const client = this.requireClient();
    this.observer = await client.peer(SIGNAL_PEER_ID, {
      metadata: {
        role: "signal-recorder",
        repoName: this.attribution.repoName,
        workspaceId: this.attribution.workspaceId
      }
    });
    return this.observer;
  }

  private requireClient(): HonchoIngestionClient {
    if (!this.client) this.client = this.createClient(this.clientConfig);
    return this.client;
  }

  private async ensureSignalSession(context: DreamContext): Promise<void> {
    if (this.signalSessionReady) return;
    this.signalSessionReady = true;
    const client = this.requireClient();
    if (!client.session) return;
    const session = await client.session(this.signalSessionId);
    await session.addPeers?.([SIGNAL_PEER_ID, RAW_USER_PEER_ID, honchoSafePeerId(this.attribution.repoName)]);
    await session.setMetadata?.({
      kind: "signal-insight-ingestion",
      runId: context.runId,
      workspaceId: this.attribution.workspaceId,
      repoName: this.attribution.repoName,
      repoRemoteUrl: this.attribution.repoRemoteUrl,
      repoBranch: this.attribution.repoBranch,
      repoCommit: this.attribution.repoCommit
    });
  }
}

function groupConclusionsByTarget(
  insights: InsightRecord[],
  attribution: SignalAttribution
): Map<string, HonchoConclusionInput[]> {
  const grouped = new Map<string, HonchoConclusionInput[]>();
  for (const insight of insights) {
    const target = targetPeerForInsight(insight, attribution);
    const existing = grouped.get(target) ?? [];
    existing.push({ content: conclusionContent(insight, attribution) });
    grouped.set(target, existing);
  }
  return grouped;
}

function targetPeerForInsight(insight: InsightRecord, attribution: SignalAttribution): string {
  return insight.scope === "user" ? "user" : honchoSafePeerId(attribution.repoName);
}

function conclusionContent(insight: InsightRecord, attribution: SignalAttribution): string {
  const appliesWhen = insight.context?.appliesWhen ? ` Applies when: ${insight.context.appliesWhen}` : "";
  const repoPrefix = insight.scope === "workspace" ? `[${attribution.repoName}] ` : "";
  return `${repoPrefix}${insight.statement}${appliesWhen}`.trim();
}

type RawSessionGroup = {
  id: string;
  sourceSessionIds: string[];
  messages: HonchoMessageInput[];
};

function groupRawEventsForRepo(events: NormalizedEvent[], attribution: SignalAttribution, runId: string): RawSessionGroup {
  const group: RawSessionGroup = {
    id: repoScopedSessionId("raw", attribution.repoName),
    sourceSessionIds: [],
    messages: []
  };
  let currentSourceSessionId = "unknown";
  let pendingToolEvents: NormalizedEvent[] = [];

  const flushToolEvents = () => {
    const message = rawToolSummaryMessage(pendingToolEvents, currentSourceSessionId, runId);
    pendingToolEvents = [];
    if (message) group.messages.push(message);
  };

  for (const event of events) {
    if (event.kind === "session_start") {
      flushToolEvents();
      currentSourceSessionId = stringMetadata(event, "sessionId") ?? event.id;
      if (!group.sourceSessionIds.includes(currentSourceSessionId)) group.sourceSessionIds.push(currentSourceSessionId);
      continue;
    }
    if (event.kind === "tool") {
      pendingToolEvents.push(event);
      continue;
    }
    flushToolEvents();
    const message = rawMessageForEvent(event, currentSourceSessionId, runId);
    if (message) group.messages.push(message);
  }
  flushToolEvents();

  if (group.messages.length > 0 && group.sourceSessionIds.length === 0) group.sourceSessionIds.push("unknown");
  return group;
}

function rawMessageForEvent(event: NormalizedEvent, sourceSessionId: string, runId: string): HonchoMessageInput | null {
  if (event.kind !== "message") return null;
  const role = stringMetadata(event, "role");
  const metadata: Record<string, unknown> = {
    kind: event.kind,
    eventId: event.id,
    timestamp: event.timestamp,
    sourceSessionId,
    runId
  };
  const type = stringMetadata(event, "type");
  const toolName = stringMetadata(event, "toolName");
  if (type) metadata.type = type;
  if (toolName) metadata.toolName = toolName;
  return {
    peerId: role === "user" ? RAW_USER_PEER_ID : role === "assistant" ? RAW_ASSISTANT_PEER_ID : RAW_SYSTEM_PEER_ID,
    content: compactRawEventContent(event),
    createdAt: event.timestamp,
    metadata
  };
}

function rawToolSummaryMessage(events: NormalizedEvent[], sourceSessionId: string, runId: string): HonchoMessageInput | null {
  if (events.length === 0) return null;
  const first = events[0];
  const last = events.at(-1) ?? first;
  const shown = events.slice(0, MAX_TOOL_SUMMARY_ITEMS).map(compactToolEvent);
  const omitted = events.length - shown.length;
  const content = [
    `Tool activity (${events.length} event${events.length === 1 ? "" : "s"}):`,
    ...shown.map((item) => `- ${item}`),
    omitted > 0 ? `- ... ${omitted} more` : undefined
  ].filter((line): line is string => Boolean(line)).join("\n");
  const toolNames = [...new Set(events.map((event) => stringMetadata(event, "toolName")).filter((name): name is string => Boolean(name)))];
  return {
    peerId: RAW_SYSTEM_PEER_ID,
    content: content.length <= MAX_RAW_EVENT_CONTENT_CHARS
      ? content
      : `${content.slice(0, MAX_RAW_EVENT_CONTENT_CHARS - 3).trimEnd()}...`,
    createdAt: first.timestamp,
    metadata: {
      kind: "tool_summary",
      eventIds: events.map((event) => event.id),
      firstTimestamp: first.timestamp,
      lastTimestamp: last.timestamp,
      sourceSessionId,
      runId,
      toolNames,
      eventCount: events.length
    }
  };
}

function compactToolEvent(event: NormalizedEvent): string {
  const type = stringMetadata(event, "type")?.replace(/^tool\./, "") ?? "tool";
  const toolName = stringMetadata(event, "toolName") ?? "unknown";
  const success = event.metadata.success;
  const suffix = typeof success === "boolean" ? ` success=${success}` : "";
  return `${toolName} ${type}${suffix}`;
}

function compactRawEventContent(event: NormalizedEvent): string {
  const content = event.text.trim();
  if (content.length <= MAX_RAW_EVENT_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_RAW_EVENT_CONTENT_CHARS - 3).trimEnd()}...`;
}

function stringMetadata(event: NormalizedEvent, key: string): string | undefined {
  const value = event.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
