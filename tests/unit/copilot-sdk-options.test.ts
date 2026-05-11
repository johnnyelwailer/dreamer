import { afterEach, describe, expect, it } from "vitest";
import { buildCopilotSdkProviderOptions } from "../../src/dream/copilot-sdk-options.js";
import { parseRuntimeManifestObject } from "../../src/dream/runtime-manifest-parse.js";
import type { RuntimeManifest } from "../../src/dream/runtime-manifest.js";

function createRuntimeManifest(
  infiniteSessionsEnabled?: boolean,
  providerMode: "copilot" | "byok" = "copilot"
): RuntimeManifest {
  return {
    provider: {
      id: "provider.copilot.sdk",
      defaultModel: "gpt-5",
      sdk: {
        authMode: "none",
        providerMode,
        requestTimeoutMs: 1000,
        ...(infiniteSessionsEnabled !== undefined ? { infiniteSessionsEnabled } : {}),
        clientExtraEnvVars: [],
        ...(providerMode === "byok"
          ? {
              byok: {
                type: "openai",
                wireApi: "completions",
                baseUrl: "http://localhost:11434/v1"
              }
            }
          : {})
      }
    },
    pipeline: { stageOrder: ["stage.orientation"] },
    docs: {
      outputRootPath: "docs/generated",
      fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
      promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
      improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
      maxSignals: 25,
      maxMemories: 25,
      maxEvents: 25
    },
    eval: {
      casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
      reportPath: "reports/evals/copilot-sdk-eval.json",
      requestTimeoutMs: 120000,
      maxAttempts: 3,
      quality: {
        rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
        reportPath: "reports/evals/dream-quality-eval.json",
        selfImproveReportPath: "reports/evals/dream-self-improve.json",
        minPassingScore: 0.8,
        maxHintsToPersist: 8
      }
    }
  };
}

describe("buildCopilotSdkProviderOptions", () => {
  afterEach(() => {
    delete process.env.COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS;
    delete process.env.COPILOT_SDK_MAX_PROMPT_TOKENS;
    delete process.env.COPILOT_SDK_MAX_SUBAGENT_PARALLELISM;
    delete process.env.COPILOT_SDK_STREAMING;
    delete process.env.COPILOT_SDK_INCLUDE_SUBAGENT_STREAMING_EVENTS;
  });

  it("enables infinite sessions by default", () => {
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(), "gpt-5", process.cwd());
    expect(options.sessionConfig.infiniteSessions).toEqual({ enabled: true });
  });

  it("honors runtime infiniteSessionsEnabled when true", () => {
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(true), "gpt-5", process.cwd());
    expect(options.sessionConfig.infiniteSessions).toEqual({ enabled: true });
  });

  it("applies env overrides for model context limits", () => {
    process.env.COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS = "64000";
    process.env.COPILOT_SDK_MAX_PROMPT_TOKENS = "16000";

    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(), "gpt-5", process.cwd());
    expect(options.sessionConfig.modelCapabilities?.limits?.max_context_window_tokens).toBe(64000);
    expect(options.sessionConfig.modelCapabilities?.limits?.max_prompt_tokens).toBe(16000);
  });

  it("adds BYOK custom model listing with configured limits", () => {
    process.env.COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS = "64000";
    process.env.COPILOT_SDK_MAX_PROMPT_TOKENS = "16000";

    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(undefined, "byok"), "gpt-5", process.cwd());
    const models = options.clientOptions.onListModels?.();

    expect(models).toBeDefined();
    expect(Array.isArray(models)).toBe(true);
    if (!Array.isArray(models)) throw new Error("Expected synchronous model list");
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("gpt-5");
    expect(models[0]?.capabilities?.limits?.max_context_window_tokens).toBe(64000);
    expect(models[0]?.capabilities?.limits?.max_prompt_tokens).toBe(16000);
  });

  it("does not add custom model listing outside BYOK", () => {
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(undefined, "copilot"), "gpt-5", process.cwd());
    expect(options.clientOptions.onListModels).toBeUndefined();
  });

  it("ignores invalid context limit env values", () => {
    process.env.COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS = "0";
    process.env.COPILOT_SDK_MAX_PROMPT_TOKENS = "not-a-number";

    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(), "gpt-5", process.cwd());
    expect(options.sessionConfig.modelCapabilities).toBeUndefined();
  });

  it("applies streaming env toggles", () => {
    process.env.COPILOT_SDK_STREAMING = "true";
    process.env.COPILOT_SDK_INCLUDE_SUBAGENT_STREAMING_EVENTS = "0";
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(), "gpt-5", process.cwd());
    expect(options.sessionConfig.streaming).toBe(true);
    expect(options.sessionConfig.includeSubAgentStreamingEvents).toBe(false);
  });

  it("resolves max subagent parallelism from runtime and allows env override", () => {
    const runtime = createRuntimeManifest();
    runtime.provider.sdk.maxSubagentParallelism = 2;

    const runtimeOnly = buildCopilotSdkProviderOptions(runtime, "gpt-5", process.cwd());
    expect(runtimeOnly.maxSubagentParallelism).toBe(2);

    process.env.COPILOT_SDK_MAX_SUBAGENT_PARALLELISM = "1";
    const envOverride = buildCopilotSdkProviderOptions(runtime, "gpt-5", process.cwd());
    expect(envOverride.maxSubagentParallelism).toBe(1);
  });
});

describe("parseRuntimeManifestObject", () => {
  const mainSignalExcludedTools = [
    "read_file",
    "get_message_details",
    "bash",
    "read_bash",
    "view",
    "grep_search",
    "file_search",
    "semantic_search",
    "list_dir",
    "run_in_terminal",
    "send_to_terminal",
    "get_terminal_output",
    "terminal_last_command"
  ];

  it("parses provider.sdk.infiniteSessionsEnabled when provided", () => {
    const parsed = parseRuntimeManifestObject({
      provider: {
        id: "provider.copilot.sdk",
        defaultModel: "gpt-5",
        sdk: {
          authMode: "none",
          providerMode: "copilot",
          requestTimeoutMs: 1000,
          infiniteSessionsEnabled: false,
          clientExtraEnvVars: []
        }
      },
      pipeline: { stageOrder: ["stage.orientation"] },
      docs: {
        outputRootPath: "docs/generated",
        fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
        promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
        improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
        maxSignals: 25,
        maxMemories: 25,
        maxEvents: 25
      },
      eval: {
        casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
        reportPath: "reports/evals/copilot-sdk-eval.json",
        requestTimeoutMs: 120000,
        maxAttempts: 3,
        quality: {
          rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
          reportPath: "reports/evals/dream-quality-eval.json",
          selfImproveReportPath: "reports/evals/dream-self-improve.json",
          minPassingScore: 0.8,
          maxHintsToPersist: 8
        }
      }
    });

    expect(parsed.provider.sdk.infiniteSessionsEnabled).toBe(false);
  });

  it("parses provider.sdk.maxSubagentParallelism when provided", () => {
    const parsed = parseRuntimeManifestObject({
      provider: {
        id: "provider.copilot.sdk",
        defaultModel: "gpt-5",
        sdk: {
          authMode: "none",
          providerMode: "copilot",
          requestTimeoutMs: 1000,
          maxSubagentParallelism: 2,
          clientExtraEnvVars: []
        }
      },
      pipeline: { stageOrder: ["stage.orientation"] },
      docs: {
        outputRootPath: "docs/generated",
        fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
        promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
        improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
        maxSignals: 25,
        maxMemories: 25,
        maxEvents: 25
      },
      eval: {
        casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
        reportPath: "reports/evals/copilot-sdk-eval.json",
        requestTimeoutMs: 120000,
        maxAttempts: 3,
        quality: {
          rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
          reportPath: "reports/evals/dream-quality-eval.json",
          selfImproveReportPath: "reports/evals/dream-self-improve.json",
          minPassingScore: 0.8,
          maxHintsToPersist: 8
        }
      }
    });

    expect(parsed.provider.sdk.maxSubagentParallelism).toBe(2);
  });

  it("rejects non-positive provider.sdk.maxSubagentParallelism values", () => {
    expect(() =>
      parseRuntimeManifestObject({
        provider: {
          id: "provider.copilot.sdk",
          defaultModel: "gpt-5",
          sdk: {
            authMode: "none",
            providerMode: "copilot",
            requestTimeoutMs: 1000,
            maxSubagentParallelism: 0,
            clientExtraEnvVars: []
          }
        },
        pipeline: { stageOrder: ["stage.orientation"] },
        docs: {
          outputRootPath: "docs/generated",
          fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
          promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
          improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
          maxSignals: 25,
          maxMemories: 25,
          maxEvents: 25
        },
        eval: {
          casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
          reportPath: "reports/evals/copilot-sdk-eval.json",
          requestTimeoutMs: 120000,
          maxAttempts: 3,
          quality: {
            rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
            reportPath: "reports/evals/dream-quality-eval.json",
            selfImproveReportPath: "reports/evals/dream-self-improve.json",
            minPassingScore: 0.8,
            maxHintsToPersist: 8
          }
        }
      })
    ).toThrow(/provider\.sdk\.maxSubagentParallelism/);
  });

  it("rejects non-boolean provider.sdk.infiniteSessionsEnabled values", () => {
    expect(() =>
      parseRuntimeManifestObject({
        provider: {
          id: "provider.copilot.sdk",
          defaultModel: "gpt-5",
          sdk: {
            authMode: "none",
            providerMode: "copilot",
            requestTimeoutMs: 1000,
            infiniteSessionsEnabled: "false",
            clientExtraEnvVars: []
          }
        },
        pipeline: { stageOrder: ["stage.orientation"] },
        docs: {
          outputRootPath: "docs/generated",
          fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
          promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
          improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
          maxSignals: 25,
          maxMemories: 25,
          maxEvents: 25
        },
        eval: {
          casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
          reportPath: "reports/evals/copilot-sdk-eval.json",
          requestTimeoutMs: 120000,
          maxAttempts: 3,
          quality: {
            rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
            reportPath: "reports/evals/dream-quality-eval.json",
            selfImproveReportPath: "reports/evals/dream-self-improve.json",
            minPassingScore: 0.8,
            maxHintsToPersist: 8
          }
        }
      })
    ).toThrow(/provider\.sdk\.infiniteSessionsEnabled/);
  });

  it("parses optional pipeline.agentPacks", () => {
    const parsed = parseRuntimeManifestObject({
      provider: {
        id: "provider.copilot.sdk",
        defaultModel: "gpt-5",
        sdk: {
          authMode: "none",
          providerMode: "copilot",
          requestTimeoutMs: 1000,
          clientExtraEnvVars: []
        }
      },
      pipeline: {
        stageOrder: ["stage.orientation", "stage.signal"],
        agentPacks: {
          "stage.signal": {
            defaultAgent: { excludedTools: mainSignalExcludedTools },
            customAgents: [
              {
                name: "timeline-analyst",
                displayName: "Timeline Analyst",
                description: "Extracts retries and chronology",
                tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
                promptTemplatePath: ".dreamer/config/prompts/stages/signal/timeline.md",
                infer: true
              },
              {
                name: "failure-analyst",
                tools: ["bash", "read_bash", "view", "read_file", "get_message_details"],
                promptTemplatePath: ".dreamer/config/prompts/stages/signal/failure.md",
                infer: true
              }
            ]
          }
        }
      },
      docs: {
        outputRootPath: "docs/generated",
        fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
        promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
        improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
        maxSignals: 25,
        maxMemories: 25,
        maxEvents: 25
      },
      eval: {
        casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
        reportPath: "reports/evals/copilot-sdk-eval.json",
        requestTimeoutMs: 120000,
        maxAttempts: 3,
        quality: {
          rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
          reportPath: "reports/evals/dream-quality-eval.json",
          selfImproveReportPath: "reports/evals/dream-self-improve.json",
          minPassingScore: 0.8,
          maxHintsToPersist: 8
        }
      }
    });

    const pack = parsed.pipeline.agentPacks?.["stage.signal"];
    expect(pack?.defaultAgent?.excludedTools).toEqual(mainSignalExcludedTools);
    expect(pack?.customAgents).toHaveLength(2);
    expect(pack?.customAgents[0]?.name).toBe("timeline-analyst");
    expect(pack?.execution).toBeUndefined();
  });

  it("rejects invalid pipeline.agentPacks.defaultAgent", () => {
    expect(() =>
      parseRuntimeManifestObject({
        provider: {
          id: "provider.copilot.sdk",
          defaultModel: "gpt-5",
          sdk: {
            authMode: "none",
            providerMode: "copilot",
            requestTimeoutMs: 1000,
            clientExtraEnvVars: []
          }
        },
        pipeline: {
          stageOrder: ["stage.orientation"],
          agentPacks: {
            "stage.signal": {
              defaultAgent: "invalid",
              customAgents: []
            }
          }
        },
        docs: {
          outputRootPath: "docs/generated",
          fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
          promptTemplatePath: ".dreamer/config/prompts/docs-generation.md",
          improvementHintsPath: ".dreamer/config/prompts/docs-improvement-hints.md",
          maxSignals: 25,
          maxMemories: 25,
          maxEvents: 25
        },
        eval: {
          casesPath: ".dreamer/config/evals/copilot-sdk-cases.json",
          reportPath: "reports/evals/copilot-sdk-eval.json",
          requestTimeoutMs: 120000,
          maxAttempts: 3,
          quality: {
            rubricPath: ".dreamer/config/evals/dream-quality-rubric.json",
            reportPath: "reports/evals/dream-quality-eval.json",
            selfImproveReportPath: "reports/evals/dream-self-improve.json",
            minPassingScore: 0.8,
            maxHintsToPersist: 8
          }
        }
      })
    ).toThrow(/pipeline\.agentPacks\.stage\.signal\.defaultAgent|pipeline\.agentPacks\.stage\.signal/);
  });
});
