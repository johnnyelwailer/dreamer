import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRuntimeManifest } from "../../src/dream/runtime-manifest.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";

const tempDirs: string[] = [];
const oldRuntimeConfigFile = process.env.DREAM_RUNTIME_CONFIG_FILE;

afterEach(() => {
  process.env.DREAM_RUNTIME_CONFIG_FILE = oldRuntimeConfigFile;
  for (const dir of tempDirs.splice(0)) {
    rmSync(workspaceStorageDir(dir), { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeRuntime(workspaceDir: string, manifest: Record<string, unknown>): string {
  const storageDir = workspaceStorageDir(workspaceDir);
  mkdirSync(storageDir, { recursive: true });
  const path = join(storageDir, "runtime.json");
  writeFileSync(path, JSON.stringify(manifest, null, 2), "utf8");
  return path;
}

function baseRuntime(): Record<string, unknown> {
  return {
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
      stageOrder: ["stage.signal"]
    },
    docs: {
      outputRootPath: "docs/generated",
      fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
      maxSignals: 25,
      maxMemories: 25,
      maxEvents: 25
    },
    eval: {
      reportPath: "reports/evals/copilot-sdk-eval.json",
      requestTimeoutMs: 120000,
      maxAttempts: 3,
      quality: {
        reportPath: "reports/evals/dream-quality-eval.json",
        selfImproveReportPath: "reports/evals/dream-self-improve.json",
        minPassingScore: 0.8,
        maxHintsToPersist: 8
      }
    }
  };
}

describe("readRuntimeManifest", () => {
  it("uses workspace-specific runtime files by default and merges bundled default-agent exclusions", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-runtime-"));
    tempDirs.push(workspaceDir);
    delete process.env.DREAM_RUNTIME_CONFIG_FILE;
    writeRuntime(workspaceDir, {
      ...baseRuntime(),
      pipeline: {
        stageOrder: ["stage.signal"],
        stageImplementations: {
          "slot.signal": "impl.signal.local-honcho-ingest"
        },
        agentPacks: {
          "stage.signal": {
            defaultAgent: { excludedTools: ["read_file"] },
            customAgents: [
              {
                name: "workspace-local-reader",
                tools: ["read_file"],
                promptTemplatePath: "prompts/stages/signal/agents/behavior-analyst.md"
              }
            ]
          }
        }
      }
    });

    const runtime = readRuntimeManifest(workspaceDir);

    expect(runtime.pipeline.stageOrder).toEqual(["stage.signal"]);
    expect(runtime.pipeline.stageImplementations).toEqual({ "slot.signal": "impl.signal.local-honcho-ingest" });
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.customAgents.map((agent) => agent.name)).toEqual([
      "workspace-local-reader"
    ]);
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("read_file");
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("create");
  });

  it("falls back to bundled runtime config when no workspace runtime file exists", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-runtime-"));
    tempDirs.push(workspaceDir);
    delete process.env.DREAM_RUNTIME_CONFIG_FILE;

    const runtime = readRuntimeManifest(workspaceDir);

    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.customAgents.map((agent) => agent.name)).toEqual([
      "behavior-analyst",
      "architecture-analyst",
      "failure-analyst"
    ]);
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("bash");
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("view");
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("create");
    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.defaultAgent?.excludedTools).toContain("write_file");
  });

  it("respects explicitly configured runtime files", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-runtime-"));
    tempDirs.push(workspaceDir);
    const runtimePath = writeRuntime(workspaceDir, {
      ...baseRuntime(),
      pipeline: {
        stageOrder: ["stage.signal"],
        agentPacks: {
          "stage.signal": {
            defaultAgent: { excludedTools: ["read_file"] },
            customAgents: [
              {
                name: "custom-reader",
                tools: ["read_file"],
                promptTemplatePath: "prompts/stages/signal/agents/behavior-analyst.md"
              }
            ]
          }
        }
      }
    });
    process.env.DREAM_RUNTIME_CONFIG_FILE = runtimePath;

    const runtime = readRuntimeManifest(workspaceDir);

    expect(runtime.pipeline.agentPacks?.["stage.signal"]?.customAgents.map((agent) => agent.name)).toEqual([
      "custom-reader"
    ]);
  });
});
