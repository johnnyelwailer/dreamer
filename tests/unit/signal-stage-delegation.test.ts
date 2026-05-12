import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IntelligenceProvider, RunAgentOptions } from "../../src/core/contracts.js";
import type { NormalizedEvent } from "../../src/core/types.js";
import { buildContext } from "../../src/dream/build-context.js";
import type { RuntimeStageAgentPackConfig } from "../../src/dream/runtime-manifest.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";
import { SignalStage } from "../../src/stages/signal-stage.js";

const tempDirs: string[] = [];
const MAIN_SIGNAL_EXCLUDED_TOOLS = [
  "read_file",
  "get_message_details",
  "bash",
  "list_bash",
  "write_bash",
  "read_bash",
  "view",
  "read_agent",
  "skill",
  "web_fetch",
  "report_intent",
  "glob",
  "grep",
  "search",
  "grep_search",
  "file_search",
  "semantic_search",
  "list_dir",
  "create",
  "create_file",
  "write",
  "write_file",
  "edit",
  "edit_file",
  "rename",
  "rename_file",
  "delete",
  "delete_file",
  "replace_string_in_file",
  "multi_replace_string_in_file",
  "run_in_terminal",
  "send_to_terminal",
  "get_terminal_output",
  "terminal_last_command"
];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(workspaceStorageDir(dir), { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

function createEvents(): NormalizedEvent[] {
  return [
    {
      id: "e-1",
      timestamp: "2026-05-10T00:00:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-test" }
    },
    {
      id: "e-2",
      timestamp: "2026-05-10T00:00:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "Please make plan concise.",
      metadata: { role: "user" }
    }
  ];
}

function createEventsWithSessionWorkspace(sessionWorkspaceDir: string): NormalizedEvent[] {
  return [
    {
      id: "e-w1",
      timestamp: "2026-05-10T00:00:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-workspace", workspaceDir: sessionWorkspaceDir }
    },
    {
      id: "e-w2",
      timestamp: "2026-05-10T00:00:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "Use transcript workspace.",
      metadata: { role: "user" }
    }
  ];
}

function createAssistantOnlyEvents(): NormalizedEvent[] {
  return [
    {
      id: "e-a1",
      timestamp: "2026-05-10T00:00:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-assistant-only" }
    },
    {
      id: "e-a2",
      timestamp: "2026-05-10T00:00:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "Intermediary update only",
      metadata: { role: "assistant" }
    }
  ];
}

function createTwoUserSessionEvents(): NormalizedEvent[] {
  return [
    {
      id: "e-s1",
      timestamp: "2026-05-10T00:00:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-1" }
    },
    {
      id: "e-s1-u1",
      timestamp: "2026-05-10T00:00:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "First session message",
      metadata: { role: "user" }
    },
    {
      id: "e-s2",
      timestamp: "2026-05-10T00:01:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-2" }
    },
    {
      id: "e-s2-u1",
      timestamp: "2026-05-10T00:01:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "Second session message",
      metadata: { role: "user" }
    }
  ];
}

class MockProvider implements IntelligenceProvider {
  id = "provider.test";
  calls: Array<{ prompt: string; options: RunAgentOptions; toolNames: string[] }> = [];
  onRun?: (tools: unknown[]) => void | Promise<void>;
  autoFinalize = true;
  async summarize(_input: string): Promise<string> {
    return "ok";
  }

  async runAgent(prompt: string, tools: unknown[], options: RunAgentOptions = {}): Promise<string> {
    this.calls.push({
      prompt,
      options,
      toolNames: tools.map((tool) => String((tool as { name?: unknown }).name ?? "unknown"))
    });
    if (this.autoFinalize) {
      const finalizeTool = (tools as Array<{ name?: string; handler?: (args: Record<string, unknown>) => unknown | Promise<unknown> }>)
        .find((tool) => tool.name === "finalize_signal_extraction");
      await finalizeTool?.handler?.({ status: "completed", summary: "Signal extraction finished." });
    }
    await this.onRun?.(tools);
    return "ok";
  }
}

describe("SignalStage delegated mode", () => {
  it("keeps default per-session behavior when no agent pack is configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options.selectedAgent).toBeUndefined();
    expect(provider.calls[0]?.options.customAgents).toBeUndefined();
    expect(provider.calls[0]?.options.streamTag).toBe("signal:session-1.md");
  });

  it("invokes one isolated provider run per user-bearing session", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-two-sessions");
    context.events = createTwoUserSessionEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0]?.options.streamTag).toBe("signal:session-1.md");
    expect(provider.calls[1]?.options.streamTag).toBe("signal:session-2.md");
    expect(context.diary).toContain("signals:agent_run_start:session-1.md=run_1_of_2");
    expect(context.diary).toContain("signals:agent_run_end:session-2.md=run_2_of_2");
  });

  it("uses transcript session workspace as provider working directory when enabled", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    const sessionWorkspaceDir = join(workspaceDir, "captured-repo");
    mkdirSync(sessionWorkspaceDir, { recursive: true });
    tempDirs.push(workspaceDir);

    const provider = new MockProvider();
    const stage = new SignalStage(provider, undefined, {}, "session-preferred");
    const context = buildContext(workspaceDir, "run-session-workspace");
    context.events = createEventsWithSessionWorkspace(sessionWorkspaceDir);

    await stage.run(context);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options.workingDirectory).toBe(sessionWorkspaceDir);
  });

  it("passes specialist agents to one native Copilot session when signal agent pack is configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);

    const promptDir = join(workspaceDir, ".dreamer", "config", "prompts", "stages", "signal", "agents");
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(
      join(promptDir, "timeline.md"),
      "Timeline role for {{session_file}} in {{run_dir}}.",
      "utf8"
    );
    writeFileSync(
      join(promptDir, "failure.md"),
      "Failure role for {{session_file}} using {{orientation_path}}.",
      "utf8"
    );

    const pack: RuntimeStageAgentPackConfig = {
      defaultAgent: { excludedTools: MAIN_SIGNAL_EXCLUDED_TOOLS },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/timeline.md",
          infer: true
        },
        {
          name: "failure-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/failure.md",
          infer: true
        }
      ]
    };

    const provider = new MockProvider();
    const stage = new SignalStage(provider, pack);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options.selectedAgent).toBeUndefined();
    expect(provider.calls[0]?.options.defaultAgent).toEqual({
      excludedTools: MAIN_SIGNAL_EXCLUDED_TOOLS
    });
    expect(provider.calls[0]?.options.customAgents?.map((agent) => agent.name)).toEqual([
      "timeline-analyst",
      "failure-analyst"
    ]);
    expect(provider.calls[0]?.toolNames).toEqual([
      "read_file",
      "get_message_details",
      "record_insight",
      "finalize_signal_extraction"
    ]);
    expect(provider.calls[0]?.prompt).toContain("session-1.md");
    expect(provider.calls[0]?.prompt).toContain("Only the main agent calls `record_insight` and `finalize_signal_extraction`");
    expect(provider.calls[0]?.prompt).toContain("Review evidence from the target session");
  });

  it("loads packaged signal agent prompts when workspace templates are absent", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);

    const pack: RuntimeStageAgentPackConfig = {
      defaultAgent: { excludedTools: MAIN_SIGNAL_EXCLUDED_TOOLS },
      customAgents: [
        {
          name: "behavior-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: "prompts/stages/signal/agents/behavior-analyst.md",
          infer: false
        },
        {
          name: "failure-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: "prompts/stages/signal/agents/failure-analyst.md",
          infer: false
        }
      ]
    };

    const provider = new MockProvider();
    const stage = new SignalStage(provider, pack);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options.selectedAgent).toBeUndefined();
    expect(provider.calls[0]?.options.defaultAgent).toEqual({
      excludedTools: MAIN_SIGNAL_EXCLUDED_TOOLS
    });
    expect(provider.calls[0]?.options.customAgents?.[0]?.prompt).toContain("behavior analyst");
    expect(provider.calls[0]?.options.customAgents?.[0]?.prompt).toContain("collaboration preferences");
    expect(provider.calls[0]?.options.customAgents?.[1]?.prompt).toContain("failure analyst");
    expect(provider.calls[0]?.options.customAgents?.[1]?.prompt).toContain("Do not call record_insight");
    expect(provider.calls[0]?.toolNames).toEqual([
      "read_file",
      "get_message_details",
      "record_insight",
      "finalize_signal_extraction"
    ]);
  });

  it("runs explicit specialist sequence before the main signal pass when configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);

    const promptDir = join(workspaceDir, ".dreamer", "config", "prompts", "stages", "signal", "agents");
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(
      join(promptDir, "timeline.md"),
      "Timeline role for {{session_file}} in {{run_dir}}.",
      "utf8"
    );
    writeFileSync(
      join(promptDir, "failure.md"),
      "Failure role for {{session_file}} using {{orientation_path}}.",
      "utf8"
    );

    const pack: RuntimeStageAgentPackConfig = {
      defaultAgent: { excludedTools: MAIN_SIGNAL_EXCLUDED_TOOLS },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/timeline.md",
          infer: true
        },
        {
          name: "failure-analyst",
          tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/failure.md",
          infer: true
        }
      ],
      execution: {
        mode: "explicit-sequence",
        explicitSequence: ["timeline-analyst", "failure-analyst"]
      }
    };

    const provider = new MockProvider();
    const stage = new SignalStage(provider, pack);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(3);
    expect(provider.calls.map((call) => call.options.selectedAgent)).toEqual([
      "timeline-analyst",
      "failure-analyst",
      undefined
    ]);
    expect(provider.calls[0]?.prompt).toContain("Specialist pass 1/2: timeline-analyst");
    expect(provider.calls[2]?.options.streamTag).toBe("signal:session-1.md");
  });

  it("skips sessions that have zero user turns", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-assistant-only");
    context.events = createAssistantOnlyEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(0);
    expect(context.diary).toContain("signals:skipped_no_user_turns=session-1.md");
  });

  it("continues when finalize_signal_extraction is still missing after insist pass", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    provider.autoFinalize = false;
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-missing-finalize");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(2);
    expect(context.diary).toContain("signals:missing_final_verdict=session-1.md");
  });

  it("requires signal finalization before accepting insights from a user-bearing session", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    provider.autoFinalize = false;
    provider.onRun = async (tools) => {
      const recordInsight = tools.find((tool) => (tool as { name?: string }).name === "record_insight") as
        | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
        | undefined;
      await recordInsight?.handler({
        statement: "User prefers compact plans before implementation.",
        scope: "user",
        references: [{ kind: "session", value: "session-test" }],
        evidence: [{ session_id: "session-test", from_message: 1, to_message: 1 }]
      });
    };
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-missing-final");
    context.events = createEvents();

    await stage.run(context);

    expect(context.insights).toHaveLength(0);
    expect(context.diary).toContain("signals:missing_final_verdict=session-1.md");
  });

  it("accepts no-insights sessions only when finalized explicitly", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    provider.onRun = async (tools) => {
      const finalize = tools.find((tool) => (tool as { name?: string }).name === "finalize_signal_extraction") as
        | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
        | undefined;
      await finalize?.handler({
        status: "no_insights_found",
        summary: "Reviewed session-1.md and found no durable memory candidates."
      });
    };
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-finalized-empty");
    context.events = createEvents();

    await stage.run(context);

    expect(context.insights).toHaveLength(0);
    expect(context.diary).toContain("signals:final_status:session-1.md=no_insights_found");
    expect(context.diary).not.toContain("signals:missing_final_verdict=session-1.md");
  });
});
