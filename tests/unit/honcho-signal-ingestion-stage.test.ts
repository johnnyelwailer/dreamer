import { describe, expect, it } from "vitest";
import type { HonchoConfig } from "@honcho-ai/sdk";
import { buildContext } from "../../src/dream/build-context.js";
import { HonchoSignalIngestionImplementation } from "../../src/stages/honcho-signal-ingestion-stage.js";

type CapturedMessage = {
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
};

describe("HonchoSignalIngestionImplementation", () => {
  it("runs local signal extraction before ingesting only recorded insights", async () => {
    const messages: CapturedMessage[] = [];
    const addedPeers: unknown[] = [];
    const metadata: Record<string, unknown>[] = [];
    const localSignalStage = {
      id: "stage.signal",
      run: async (context: ReturnType<typeof buildContext>) => {
        context.insights.push({ statement: "User prefers precise references", scope: "user" });
        context.diary.push("local-signal:ran");
        return context;
      }
    };
    const implementation = new HonchoSignalIngestionImplementation(localSignalStage, "/tmp/workspace", {
      workspaceId: "test-workspace",
      createClient: (_config: HonchoConfig) => ({
        workspaceId: "test-workspace",
        peer: async (id: string) => ({ id }),
        session: async (id: string) => ({
          id,
          addPeers: async (peers: unknown) => {
            addedPeers.push(peers);
          },
          addMessages: async (input: CapturedMessage | CapturedMessage[]) => {
            messages.push(...(Array.isArray(input) ? input : [input]));
          },
          setMetadata: async (input: Record<string, unknown>) => {
            metadata.push(input);
          }
        })
      })
    });
    const context = buildContext("/tmp/workspace", "run-test");
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
    expect(addedPeers).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      peerId: "signal-recorder",
      content: "User prefers precise references",
      metadata: { kind: "signal_insight", scope: "user" }
    });
    expect(metadata.at(-1)).toMatchObject({ insightCount: 1, kind: "signal-ingestion", runId: "run-test" });
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
          peer: async (id: string) => ({ id }),
          session: async (id: string) => ({
            id,
            addPeers: async () => {},
            addMessages: async (input: CapturedMessage | CapturedMessage[]) => {
              batchSizes.push(Array.isArray(input) ? input.length : 1);
            },
            setMetadata: async () => {}
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
