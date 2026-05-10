import { beforeEach, describe, expect, it, vi } from "vitest";

type CreateSessionArgs = Record<string, unknown>;

const mockState: {
  createSessionArgs: CreateSessionArgs[];
  prompts: string[];
} = {
  createSessionArgs: [],
  prompts: []
};

vi.mock("@github/copilot-sdk", () => {
  class MockCopilotClient {
    constructor(_options: unknown) {}

    async start(): Promise<void> {}

    async stop(): Promise<void> {}

    async createSession(args: CreateSessionArgs): Promise<{ sendAndWait: (request: { prompt: string }) => Promise<unknown> }> {
      mockState.createSessionArgs.push(args);
      return {
        sendAndWait: async (request: { prompt: string }) => {
          mockState.prompts.push(request.prompt);
          const onEvent = args.onEvent as ((event: unknown) => void) | undefined;
          onEvent?.({ type: "subagent.started", data: { agentName: "timeline-analyst" } });
          return { data: { content: "ok" } };
        }
      };
    }
  }

  return {
    CopilotClient: MockCopilotClient,
    approveAll: async () => ({ kind: "approved" })
  };
});

import { CopilotSdkProvider } from "../../src/providers/copilot-sdk-provider.js";

describe("CopilotSdkProvider.runAgent", () => {
  beforeEach(() => {
    mockState.createSessionArgs = [];
    mockState.prompts = [];
  });

  it("passes custom agent and default agent options to createSession", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd(),
        includeSubAgentStreamingEvents: true
      }
    });

    const events: unknown[] = [];
    await provider.runAgent("analyze", [], {
      workingDirectory: "/tmp/work",
      retries: ["retry"],
      selectedAgent: "timeline-analyst",
      onSubagentEvent: (event) => events.push(event),
      defaultAgent: { excludedTools: ["record_insight"] },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["read_file"],
          prompt: "Analyze timeline",
          infer: true
        }
      ]
    });

    expect(mockState.createSessionArgs).toHaveLength(1);
    const args = mockState.createSessionArgs[0] ?? {};
    expect(args.workingDirectory).toBe("/tmp/work");
    expect(args.agent).toBe("timeline-analyst");
    expect(args.defaultAgent).toEqual({ excludedTools: ["record_insight"] });
    expect(args.customAgents).toEqual([
      {
        name: "timeline-analyst",
        tools: ["read_file"],
        prompt: "Analyze timeline",
        infer: true
      }
    ]);
    expect(events).toHaveLength(2);
    expect(mockState.prompts).toEqual(["analyze", "retry"]);
  });

  it("denies read_bash unless bash previously returned the shellId", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", []);

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
      onPostToolUse: (input: { toolName: string; toolArgs: unknown; toolResult: unknown }) => unknown;
    };

    expect(hooks).toBeTruthy();
    expect(
      hooks.onPreToolUse({
        toolName: "read_bash",
        toolArgs: { shellId: "made-up" }
      })
    ).toMatchObject({ permissionDecision: "deny" });

    hooks.onPostToolUse({
      toolName: "bash",
      toolArgs: { command: "pnpm test" },
      toolResult: {
        textResultForLlm: "Command is still running. Use read_bash with shellId=\"shell-123\".",
        resultType: "success"
      }
    });

    expect(
      hooks.onPreToolUse({
        toolName: "read_bash",
        toolArgs: { shellId: "shell-123" }
      })
    ).toMatchObject({ permissionDecision: "allow" });
  });

  it("denies native task delegation to unconfigured agent types", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      customAgents: [
        {
          name: "failure-analyst",
          tools: ["bash"],
          prompt: "Inspect failures.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };

    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "explore" }
      })
    ).toMatchObject({ permissionDecision: "deny" });
    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "failure-analyst" }
      })
    ).toBeUndefined();
  });
});
