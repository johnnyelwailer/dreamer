import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readDreamConfig } from "../../src/dream/config.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";

const tempDirs: string[] = [];
const envKeys = [
  "DREAM_ADAPTER_ID",
  "DREAM_STAGE_ORDER",
  "COPILOT_SDK_MODEL",
  "DREAM_RUNTIME_CONFIG_FILE",
  "DREAM_MEMORY_BACKUP_ENABLED",
  "DREAM_COPILOT_SESSION_SCOPE_MODE",
  "DREAM_COPILOT_BATCH_SESSIONS",
  "DREAM_STAGE_IMPLEMENTATIONS"
] as const;
const envSnapshot = new Map(envKeys.map((key) => [key, process.env[key]]));

afterEach(async () => {
  for (const key of envKeys) {
    const value = envSnapshot.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(tempDirs.splice(0).map(async (dir) => {
    await rm(workspaceStorageDir(dir), { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }));
});

async function tempWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dreamer-config-test-"));
  tempDirs.push(dir);
  return dir;
}

async function writeRuntime(workspaceDir: string): Promise<void> {
  const storageDir = workspaceStorageDir(workspaceDir);
  await mkdir(storageDir, { recursive: true });
  await writeFile(join(storageDir, "runtime.json"), JSON.stringify({
    provider: {
      id: "provider.copilot.sdk",
      defaultModel: "runtime-model",
      sdk: {
        authMode: "none",
        providerMode: "copilot",
        requestTimeoutMs: 1000,
        clientExtraEnvVars: []
      }
    },
    pipeline: {
      stageOrder: ["stage.orientation", "stage.signal"],
      stageImplementations: {
        "stage.signal": "stage.signal"
      }
    },
    docs: {
      outputRootPath: "docs/generated",
      fallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
      promptTemplatePath: "docs/generated/template.md",
      improvementHintsPath: "docs/generated/hints.md",
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
        maxHintsToPersist: 8,
        rubricPath: "reports/evals/rubric.json"
      },
      casesPath: "reports/evals/cases.json"
    }
  }, null, 2), "utf8");
}

describe("readDreamConfig", () => {
  it("loads missing env values from .env.local", async () => {
    const workspaceDir = await tempWorkspace();
    await writeRuntime(workspaceDir);
    await writeFile(join(workspaceDir, ".env.local"), [
      "DREAM_ADAPTER_ID=adapter.jsonl.event",
      "DREAM_STAGE_ORDER=stage.orientation,stage.observability",
      "COPILOT_SDK_MODEL=dotenv-model"
    ].join("\n"), "utf8");

    const config = readDreamConfig(workspaceDir);

    expect(config.adapterId).toBe("adapter.jsonl.event");
    expect(config.stageOrder).toEqual(["slot.orientation", "slot.observability"]);
    expect(config.stageImplementations).toEqual({ "slot.signal": "stage.signal" });
    expect(config.copilotSdkModel).toBe("dotenv-model");
    expect(config.memoryBackupEnabled).toBe(true);
    expect(config.memoryBackupExternalOnly).toBe(true);
  });

  it("reads stage implementation bindings from environment", async () => {
    const workspaceDir = await tempWorkspace();
    await writeRuntime(workspaceDir);
    process.env.DREAM_STAGE_IMPLEMENTATIONS = "stage.signal=impl.signal.local-honcho-ingest";

    const config = readDreamConfig(workspaceDir);

    expect(config.stageImplementations).toEqual({ "slot.signal": "impl.signal.local-honcho-ingest" });
  });

  it("does not let .env.local override an exported env var", async () => {
    const workspaceDir = await tempWorkspace();
    await writeRuntime(workspaceDir);
    await writeFile(join(workspaceDir, ".env.local"), "COPILOT_SDK_MODEL=dotenv-model\n", "utf8");
    process.env.COPILOT_SDK_MODEL = "process-model";

    const config = readDreamConfig(workspaceDir);

    expect(config.copilotSdkModel).toBe("process-model");
  });

  it("reads memory backup toggles from environment", async () => {
    const workspaceDir = await tempWorkspace();
    await writeRuntime(workspaceDir);
    process.env.DREAM_MEMORY_BACKUP_ENABLED = "false";

    const config = readDreamConfig(workspaceDir);

    expect(config.memoryBackupEnabled).toBe(false);
  });

  it("defaults to newest-first session scope and allows env override", async () => {
    const workspaceDir = await tempWorkspace();
    await writeRuntime(workspaceDir);

    const defaultConfig = readDreamConfig(workspaceDir);
    expect(defaultConfig.copilotDebugSessionScopeMode).toBe("newest-first");
    expect(defaultConfig.copilotDebugBatchSessions).toBe(3);

    process.env.DREAM_COPILOT_SESSION_SCOPE_MODE = "coverage";
    process.env.DREAM_COPILOT_BATCH_SESSIONS = "7";
    const overridden = readDreamConfig(workspaceDir);
    expect(overridden.copilotDebugSessionScopeMode).toBe("coverage");
    expect(overridden.copilotDebugBatchSessions).toBe(7);
  });
});
