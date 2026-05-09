import { describe, expect, it } from "vitest";
import { buildCopilotSdkProviderOptions } from "../../src/dream/copilot-sdk-options.js";
import { parseRuntimeManifestObject } from "../../src/dream/runtime-manifest-parse.js";
import type { RuntimeManifest } from "../../src/dream/runtime-manifest.js";

function createRuntimeManifest(infiniteSessionsEnabled?: boolean): RuntimeManifest {
  return {
    provider: {
      id: "provider.copilot.sdk",
      defaultModel: "gpt-5",
      sdk: {
        authMode: "none",
        providerMode: "copilot",
        requestTimeoutMs: 1000,
        ...(infiniteSessionsEnabled !== undefined ? { infiniteSessionsEnabled } : {}),
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
  };
}

describe("buildCopilotSdkProviderOptions", () => {
  it("disables infinite sessions by default", () => {
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(), "gpt-5", process.cwd());
    expect(options.sessionConfig.infiniteSessions).toEqual({ enabled: false });
  });

  it("honors runtime infiniteSessionsEnabled when true", () => {
    const options = buildCopilotSdkProviderOptions(createRuntimeManifest(true), "gpt-5", process.cwd());
    expect(options.sessionConfig.infiniteSessions).toEqual({ enabled: true });
  });
});

describe("parseRuntimeManifestObject", () => {
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
});
