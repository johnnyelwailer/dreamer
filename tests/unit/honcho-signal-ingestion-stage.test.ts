import { describe, expect, it } from "vitest";
import type { HonchoConfig } from "@honcho-ai/sdk";
import { buildContext } from "../../src/dream/build-context.js";
import { HonchoRawSignalIngestionImplementation, HonchoSignalIngestionImplementation } from "../../src/stages/honcho-signal-ingestion-stage.js";

type CapturedConclusion = {
  target: string;
  content: string;
  sessionId?: string;
};

type CapturedMessage = {
  peerId: string;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

describe("HonchoRawSignalIngestionImplementation", () => {
  it("ingests compact raw transcript events into a repo-scoped Honcho session", async () => {
    const sessionIds: string[] = [];
    const peers: unknown[] = [];
    const messages: CapturedMessage[] = [];
    const metadata: Record<string, unknown>[] = [];
    const implementation = new HonchoRawSignalIngestionImplementation("/tmp/workspace", {
      workspaceId: "test-workspace",
      createClient: (_config: HonchoConfig) => ({
        workspaceId: "test-workspace",
        peer: async (id: string) => ({ id, conclusionsOf: () => ({ create: async () => {} }) }),
        session: async (id: string) => {
          sessionIds.push(id);
          return {
            id,
            addPeers: async (input: unknown) => {
              peers.push(input);
            },
            addMessages: async (input: CapturedMessage | CapturedMessage[]) => {
              messages.push(...(Array.isArray(input) ? input : [input]));
            },
            setMetadata: async (input: Record<string, unknown>) => {
              metadata.push(input);
            }
          };
        }
      })
    });
    const context = buildContext("/tmp/workspace", "run-raw");
    context.events = [
      {
        id: "start-1",
        timestamp: "2026-05-10T00:00:00.000Z",
        source: "test",
        kind: "session_start",
        text: "Session started",
        metadata: { sessionId: "session-1" }
      },
      {
        id: "u1",
        timestamp: "2026-05-10T00:00:01.000Z",
        source: "copilot-transcript",
        kind: "message",
        text: "Need compact Honcho payloads",
        metadata: { role: "user", type: "user.message" }
      },
      {
        id: "a1",
        timestamp: "2026-05-10T00:00:02.000Z",
        source: "copilot-transcript",
        kind: "message",
        text: "I will inspect the stage.",
        metadata: { role: "assistant", type: "assistant.message" }
      },
      {
        id: "t1",
        timestamp: "2026-05-10T00:00:03.000Z",
        source: "copilot-transcript",
        kind: "tool",
        text: "Tool start: read_file",
        metadata: { type: "tool.execution_start", toolName: "read_file" }
      },
      {
        id: "t2",
        timestamp: "2026-05-10T00:00:04.000Z",
        source: "copilot-transcript",
        kind: "tool",
        text: "Tool complete: read_file success=true",
        metadata: { type: "tool.execution_complete", toolName: "read_file", success: true }
      }
    ];

    await implementation.run({ slotId: "slot.signal", context });

    expect(sessionIds).toEqual(["raw-workspace"]);
    expect(peers).toEqual([["user", "assistant", "system"]]);
    expect(messages).toEqual([
      {
        peerId: "user",
        content: "Need compact Honcho payloads",
        createdAt: "2026-05-10T00:00:01.000Z",
        metadata: {
          kind: "message",
          eventId: "u1",
          timestamp: "2026-05-10T00:00:01.000Z",
          sourceSessionId: "session-1",
          runId: "run-raw",
          type: "user.message"
        }
      },
      {
        peerId: "assistant",
        content: "I will inspect the stage.",
        createdAt: "2026-05-10T00:00:02.000Z",
        metadata: {
          kind: "message",
          eventId: "a1",
          timestamp: "2026-05-10T00:00:02.000Z",
          sourceSessionId: "session-1",
          runId: "run-raw",
          type: "assistant.message"
        }
      },
      {
        peerId: "system",
        content: "Tool activity (2 events):\n- read_file execution_start\n- read_file execution_complete success=true",
        createdAt: "2026-05-10T00:00:03.000Z",
        metadata: {
          kind: "tool_summary",
          eventIds: ["t1", "t2"],
          firstTimestamp: "2026-05-10T00:00:03.000Z",
          lastTimestamp: "2026-05-10T00:00:04.000Z",
          sourceSessionId: "session-1",
          runId: "run-raw",
          toolNames: ["read_file"],
          eventCount: 2
        }
      }
    ]);
    expect(metadata.at(-1)).toMatchObject({
      kind: "raw-transcript-ingestion",
      runId: "run-raw",
      workspaceId: "test-workspace",
      repoName: "workspace",
      sourceSessionIds: ["session-1"],
      eventCount: 3
    });
    expect(context.diary).toContain("honcho:raw_sessions_ingested sessions=1 events=3");
  });

  it("does not create Honcho sessions when there are no transcript messages or tool events", async () => {
    const implementation = new HonchoRawSignalIngestionImplementation("/tmp/workspace", {
      workspaceId: "test-workspace",
      createClient: () => {
        throw new Error("client should not be created");
      }
    });
    const context = buildContext("/tmp/workspace", "run-empty-raw");
    context.events = [
      {
        id: "start-1",
        timestamp: "2026-05-10T00:00:00.000Z",
        source: "test",
        kind: "session_start",
        text: "Session started",
        metadata: { sessionId: "session-1" }
      }
    ];

    await implementation.run({ slotId: "slot.signal", context });

    expect(context.diary).toContain("honcho:raw_sessions_skipped sessions=0 events=0");
  });
});

describe("HonchoSignalIngestionImplementation", () => {
  it("runs local signal extraction before ingesting only recorded insights", async () => {
    const conclusions: CapturedConclusion[] = [];
    const peerIds: string[] = [];
    const sessionIds: string[] = [];
    const sessionMetadata: Record<string, unknown>[] = [];
    const localSignalStage = {
      id: "stage.signal",
      run: async (context: ReturnType<typeof buildContext>) => {
        context.insights.push({
          statement: "User prefers precise references",
          scope: "user",
          capture: {
            references: [{ kind: "session", value: "session-1" }],
            reason: "Repeated preference observed in the session."
          }
        });
        context.diary.push("local-signal:ran");
        return context;
      }
    };
    const implementation = new HonchoSignalIngestionImplementation(localSignalStage, "/tmp/workspace", {
      workspaceId: "test-workspace",
      createClient: (_config: HonchoConfig) => ({
        workspaceId: "test-workspace",
        peer: async (id: string) => {
          peerIds.push(id);
          return {
            id,
            conclusionsOf: (target: string | { id: string }) => ({
              create: async (input: { content: string; sessionId?: string } | { content: string; sessionId?: string }[]) => {
                const targetId = typeof target === "string" ? target : target.id;
                for (const conclusion of Array.isArray(input) ? input : [input]) {
                  conclusions.push({ target: targetId, content: conclusion.content, sessionId: conclusion.sessionId });
                }
              }
            })
          };
        },
        session: async (id: string) => {
          sessionIds.push(id);
          return {
            id,
            addMessages: async () => {},
            addPeers: async () => {},
            setMetadata: async (input: Record<string, unknown>) => {
              sessionMetadata.push(input);
            }
          };
        }
      })
    });
    const context = buildContext("/tmp/workspace", "run:test/with.bad chars");
    context.nowIso = "2026-05-10T00:00:00.000Z";
    context.events = [
      {
        id: "event-1",
        timestamp: "2026-05-10T00:00:00.000Z",
        source: "test",
        kind: "message",
        text: "hello\n```ts\nprocess.exit(1)\n```",
        metadata: { role: "user" }
      }
    ];

    const result = await implementation.run({ slotId: "slot.signal", context });

    expect(result.context.diary).toContain("local-signal:ran");
    expect(result.context.diary).toContain("honcho:signal_insights_ingested insights=1");
    expect(peerIds).toEqual(["signal-recorder"]);
    expect(sessionIds).toEqual(["signal-workspace"]);
    expect(sessionMetadata.at(-1)).toMatchObject({
      kind: "signal-insight-ingestion",
      runId: "run:test/with.bad chars",
      workspaceId: "test-workspace",
      repoName: "workspace"
    });
    expect(conclusions).toEqual([
      { target: "user", content: "User prefers precise references", sessionId: "signal-workspace" }
    ]);
  });

  it("batches Honcho messages to stay under API limits", async () => {
    const batchSizes: number[] = [];
    const implementation = new HonchoSignalIngestionImplementation(
      { id: "stage.signal", run: async (context) => context },
      "/tmp/workspace",
      {
        workspaceId: "test-workspace",
        createClient: (_config: HonchoConfig) => ({
          workspaceId: "test-workspace",
          peer: async (id: string) => ({
            id,
            conclusionsOf: () => ({
              create: async (input: { content: string } | { content: string }[]) => {
                batchSizes.push(Array.isArray(input) ? input.length : 1);
              }
            })
          })
        })
      }
    );
    const context = buildContext("/tmp/workspace", "run-large");
    context.insights = Array.from({ length: 205 }, (_, index) => ({
      statement: `insight ${index}`,
      scope: "workspace" as const
    }));

    await implementation.run({ slotId: "slot.signal", context });

    expect(batchSizes).toEqual([100, 100, 5]);
  });

  it("flushes live every few recorded insights", async () => {
    const batchSizes: number[] = [];
    let implementation: HonchoSignalIngestionImplementation;
    const localSignalStage = {
      id: "stage.signal",
      run: async (context: ReturnType<typeof buildContext>) => {
        for (let index = 0; index < 7; index += 1) {
          const insight = { statement: `live insight ${index}`, scope: "workspace" as const };
          context.insights.push(insight);
          implementation.recordInsight(context, insight);
        }
        return context;
      }
    };
    implementation = new HonchoSignalIngestionImplementation(localSignalStage, "/tmp/workspace", {
      workspaceId: "test-workspace",
      liveBatchSize: 3,
      createClient: (_config: HonchoConfig) => ({
        workspaceId: "test-workspace",
        peer: async (id: string) => ({
          id,
          conclusionsOf: () => ({
            create: async (input: { content: string } | { content: string }[]) => {
              batchSizes.push(Array.isArray(input) ? input.length : 1);
            }
          })
        })
      })
    });
    const context = buildContext("/tmp/workspace", "run-live");

    await implementation.run({ slotId: "slot.signal", context });

    expect(batchSizes).toEqual([3, 3, 1]);
  });

  it("can flush at session boundaries before the final stage flush", async () => {
    const batchSizes: number[] = [];
    let implementation: HonchoSignalIngestionImplementation;
    const localSignalStage = {
      id: "stage.signal",
      run: async (context: ReturnType<typeof buildContext>) => {
        for (let index = 0; index < 2; index += 1) {
          const insight = { statement: `session insight ${index}`, scope: "workspace" as const };
          context.insights.push(insight);
          implementation.recordInsight(context, insight);
        }
        await implementation.flushPending(context, "session");
        return context;
      }
    };
    implementation = new HonchoSignalIngestionImplementation(localSignalStage, "/tmp/workspace", {
      workspaceId: "test-workspace",
      liveBatchSize: 10,
      createClient: (_config: HonchoConfig) => ({
        workspaceId: "test-workspace",
        peer: async (id: string) => ({
          id,
          conclusionsOf: () => ({
            create: async (input: { content: string } | { content: string }[]) => {
              batchSizes.push(Array.isArray(input) ? input.length : 1);
            }
          })
        })
      })
    });

    await implementation.run({ slotId: "slot.signal", context: buildContext("/tmp/workspace", "run-session") });

    expect(batchSizes).toEqual([2]);
  });

  it("flushes stale pre-existing insights at startup", async () => {
    const batchSizes: number[] = [];
    const implementation = new HonchoSignalIngestionImplementation(
      { id: "stage.signal", run: async (context) => context },
      "/tmp/workspace",
      {
        workspaceId: "test-workspace",
        createClient: (_config: HonchoConfig) => ({
          workspaceId: "test-workspace",
          peer: async (id: string) => ({
            id,
            conclusionsOf: () => ({
              create: async (input: { content: string } | { content: string }[]) => {
                batchSizes.push(Array.isArray(input) ? input.length : 1);
              }
            })
          })
        })
      }
    );
    const context = buildContext("/tmp/workspace", "run-stale");
    context.insights = [{ statement: "stale insight", scope: "workspace" }];

    await implementation.run({ slotId: "slot.signal", context });

    expect(batchSizes).toEqual([1]);
  });

  it("does not create an empty Honcho session when no insights were recorded", async () => {
    const implementation = new HonchoSignalIngestionImplementation(
      { id: "stage.signal", run: async (context) => context },
      "/tmp/workspace",
      {
        workspaceId: "test-workspace",
        createClient: () => {
          throw new Error("client should not be created");
        }
      }
    );
    const context = buildContext("/tmp/workspace", "run-empty");

    await implementation.run({ slotId: "slot.signal", context });

    expect(context.diary).toContain("honcho:signal_insights_skipped insights=0");
  });
});
