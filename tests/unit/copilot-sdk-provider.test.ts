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
          if (args.customAgents) {
            onEvent?.({ type: "subagent.started", agentId: "timeline-1", data: { agentName: "timeline-analyst" } });
            onEvent?.({ type: "subagent.completed", agentId: "timeline-1", data: { agentName: "timeline-analyst" } });
          }
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
    await provider.runAgent("analyze", [{ name: "record_insight" }], {
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
    expect(events).toHaveLength(4);
    expect(mockState.prompts).toEqual(["analyze", "retry"]);
  });

  it("filters unknown excludedTools before sending defaultAgent config to the SDK", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent(
      "analyze",
      [{ name: "record_insight" }],
      {
        defaultAgent: {
          excludedTools: ["record_insight", "bash", "search", "grep_search", "run_in_terminal"]
        }
      }
    );

    const args = mockState.createSessionArgs[0] ?? {};
    expect(args.defaultAgent).toEqual({ excludedTools: ["record_insight", "bash", "grep_search"] });
  });

  it("derives SDK excludedTools from default-agent allowedTools", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent(
      "analyze",
      [{ name: "record_insight" }, { name: "finalize_signal_extraction" }],
      {
        defaultAgent: {
          allowedTools: ["task", "record_insight"]
        }
      }
    );

    const args = mockState.createSessionArgs[0] ?? {};
    expect(args.defaultAgent).toEqual({ excludedTools: ["finalize_signal_extraction", "bash", "create", "edit", "glob", "grep", "file_search", "grep_search", "semantic_search", "list_dir", "read_file", "list_agents", "list_bash", "read_agent", "read_bash", "manage_todo_list", "get_errors", "report_intent", "skill", "delegate", "view", "web_fetch", "write_bash"] });
  });

  it("only sends retry prompts when shouldRetry returns true", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd(),
      }
    });

    await provider.runAgent("analyze", [], {
      retries: ["retry-1", "retry-2"],
      shouldRetry: ({ retryIndex }) => retryIndex === 0
    });

    expect(mockState.prompts).toEqual(["analyze", "retry-1"]);
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

  it("allows explore but denies generic native task delegation", async () => {
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
    const onEvent = args.onEvent as (event: unknown) => void;

    onEvent({ type: "subagent.completed", data: { agentName: "timeline-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "explore", prompt: "Inspect failures and tool misuse." }
      })
    ).toBeUndefined();
    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: JSON.stringify({
          agent_type: "explore",
          name: "session-explorer",
          description: "Explore session",
          prompt: "Inspect session file."
        })
      })
    ).toMatchObject({
      permissionDecision: "allow",
      modifiedArgs: {
        agent_type: "explore",
        name: "session-explorer",
        description: "Explore session",
        prompt: "Inspect session file."
      }
    });
    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "general-purpose", prompt: "Read repo conventions." }
      })
    ).toMatchObject({
      permissionDecision: "deny"
    });
    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "failure-analyst" }
      })
    ).toBeUndefined();
    expect(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: {
          input: {
            name: "failure-review",
            description: "Review failures",
            prompt: "Inspect failures.",
            agent_type: "failure-analyst"
          }
        }
      })
    ).toMatchObject({
      permissionDecision: "allow",
      modifiedArgs: {
        name: "failure-review",
        description: "Review failures",
        prompt: "Inspect failures.",
        agent_type: "failure-analyst"
      }
    });
  });

  it("denies default-agent access to tools excluded for the default agent", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      defaultAgent: { excludedTools: ["bash", "read_file", "create"] },
      customAgents: [
        {
          name: "failure-analyst",
          tools: ["bash", "read_file"],
          prompt: "Inspect failures.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onPermissionRequest = args.onPermissionRequest as (
      request: { kind: string; toolName?: string },
      invocation: { sessionId: string }
    ) => unknown;

    (args.onEvent as (event: unknown) => void)?.({ type: "subagent.completed", data: { agentName: "timeline-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "bash",
        toolArgs: { command: "wc -l session-2.md" }
      })
    ).toMatchObject({ permissionDecision: "deny" });
    expect(
      hooks.onPreToolUse({
        toolName: "create",
        toolArgs: { path: "sessions/session-3.md", file_text: "nope" }
      })
    ).toMatchObject({ permissionDecision: "deny" });
    expect(onPermissionRequest({ kind: "shell" }, { sessionId: "session-1" })).toMatchObject({ kind: "reject" });
  });

  it("allows default-agent excluded tools while a configured subagent is active", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      defaultAgent: { excludedTools: ["bash"] },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["bash"],
          prompt: "Inspect timeline.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onEvent = args.onEvent as (event: unknown) => void;

    onEvent({ type: "subagent.started", agentId: "timeline-2", data: { agentName: "timeline-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "bash",
        toolArgs: { command: "wc -l session-2.md" }
      })
    ).toBeUndefined();
  });

  it("allows non-allowlisted tools while a configured subagent is active", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      defaultAgent: { allowedTools: ["task", "finalize_signal_extraction"] },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["read_file"],
          prompt: "Inspect timeline.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onEvent = args.onEvent as (event: unknown) => void;

    expect(
      hooks.onPreToolUse({
        toolName: "read_file",
        toolArgs: { path: "session-2.md" }
      })
    ).toMatchObject({ permissionDecision: "deny" });

    onEvent({ type: "subagent.started", agentId: "timeline-2", data: { agentName: "timeline-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "read_file",
        toolArgs: { path: "session-2.md" }
      })
    ).toBeUndefined();
  });

  it("keeps default-agent exclusions lifted for remaining overlapping subagents", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      defaultAgent: { excludedTools: ["bash"] },
      customAgents: [
        {
          name: "failure-analyst",
          tools: ["bash"],
          prompt: "Inspect failures.",
          infer: true
        },
        {
          name: "architecture-analyst",
          tools: ["bash"],
          prompt: "Inspect architecture.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onEvent = args.onEvent as (event: unknown) => void;

    onEvent({ type: "subagent.started", agentId: "failure-1", data: { agentName: "failure-analyst" } });
    onEvent({ type: "subagent.started", agentId: "architecture-1", data: { agentName: "architecture-analyst" } });
    onEvent({ type: "subagent.completed", agentId: "architecture-1", data: { agentName: "architecture-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "bash",
        toolArgs: { command: "grep -n fail session-2.md" }
      })
    ).toBeUndefined();

    onEvent({ type: "subagent.completed", agentId: "failure-1", data: { agentName: "failure-analyst" } });
    onEvent({ type: "subagent.completed", data: { agentName: "timeline-analyst" } });

    expect(
      hooks.onPreToolUse({
        toolName: "bash",
        toolArgs: { command: "grep -n fail session-2.md" }
      })
    ).toMatchObject({ permissionDecision: "deny" });
  });

  it("waits for a slot before allowing new task/delegate launches at max parallelism", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      maxSubagentParallelism: 1,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      customAgents: [
        {
          name: "failure-analyst",
          tools: ["read_file"],
          prompt: "Inspect failures.",
          infer: true
        },
        {
          name: "architecture-analyst",
          tools: ["read_file"],
          prompt: "Inspect architecture.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onEvent = args.onEvent as (event: unknown) => void;

    onEvent({ type: "subagent.started", agentId: "failure-1", data: { agentName: "failure-analyst" } });

    let released = false;
    const waitingLaunch = Promise.resolve(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "architecture-analyst", prompt: "Inspect architecture choices." }
      })
    ).then((result) => {
      released = true;
      return result;
    });

    await Promise.resolve();
    expect(released).toBe(false);

    onEvent({ type: "subagent.completed", agentId: "failure-1", data: { agentName: "failure-analyst" } });
    onEvent({ type: "subagent.completed", data: { agentName: "timeline-analyst" } });

    await waitingLaunch;
    expect(released).toBe(true);
  });

  it("queues same-turn burst delegations when max subagent parallelism is one", async () => {
    const provider = new CopilotSdkProvider({
      model: "gpt-5",
      requestTimeoutMs: 1000,
      maxSubagentParallelism: 1,
      clientOptions: { useLoggedInUser: false },
      sessionConfig: {
        workingDirectory: process.cwd()
      }
    });

    await provider.runAgent("analyze", [], {
      customAgents: [
        {
          name: "behavior-analyst",
          tools: ["read_file"],
          prompt: "Inspect behavior.",
          infer: true
        },
        {
          name: "architecture-analyst",
          tools: ["read_file"],
          prompt: "Inspect architecture.",
          infer: true
        }
      ]
    });

    const args = mockState.createSessionArgs[0] ?? {};
    const hooks = args.hooks as {
      onPreToolUse: (input: { toolName: string; toolArgs: unknown }) => unknown;
    };
    const onEvent = args.onEvent as (event: unknown) => void;

    onEvent({ type: "subagent.completed", data: { agentName: "timeline-analyst" } });

    await expect(
      Promise.resolve(
        hooks.onPreToolUse({
          toolName: "task",
          toolArgs: { agent_type: "behavior-analyst", prompt: "Inspect communication behavior." }
        })
      )
    ).resolves.toBeUndefined();

    let released = false;
    const queuedLaunch = Promise.resolve(
      hooks.onPreToolUse({
        toolName: "task",
        toolArgs: { agent_type: "architecture-analyst", prompt: "Inspect architecture choices." }
      })
    ).then((result) => {
      released = true;
      return result;
    });

    await Promise.resolve();
    expect(released).toBe(false);

    onEvent({ type: "subagent.started", agentId: "behavior-1", data: { agentName: "behavior-analyst" } });
    onEvent({ type: "subagent.completed", agentId: "behavior-1", data: { agentName: "behavior-analyst" } });

    await queuedLaunch;
    expect(released).toBe(true);
  });
});
