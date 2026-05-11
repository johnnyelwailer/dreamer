import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runSetupWizard } from "../../src/cli/setup-wizard.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";
import { runtimeManifestPath } from "../../src/dream/runtime-manifest.js";

const tempDirs: string[] = [];
const envKeys = ["DREAM_RUNTIME_CONFIG_FILE", "DREAM_PLUGIN_PATHS"] as const;
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
  const dir = await mkdtemp(join(tmpdir(), "dreamer-setup-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("runSetupWizard", () => {
  it("writes runtime config and env fallbacks in non-interactive mode", async () => {
    const workspaceDir = await tempWorkspace();

    await runSetupWizard(workspaceDir, {
      yes: true,
      adapter: "adapter.jsonl.event",
      backend: "backend.copilot.memory",
      providerMode: "byok",
      authMode: "none",
      model: "gpt-4o-mini",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "local-token",
      contextLength: "32768",
      promptTokens: "4096",
      maxSubagentParallelism: "2",
      pluginPath: ["./plugins/custom.ts"],
      stageOrder: "stage.orientation,stage.signal,stage.observability",
      verify: false
    });

    const runtimePath = runtimeManifestPath(workspaceDir);
    const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as {
      provider: { defaultModel: string; sdk: { providerMode: string; authMode: string; maxSubagentParallelism?: number; byok?: { baseUrlEnvVar?: string; apiKeyEnvVar?: string } } };
      pipeline: { stageOrder: string[] };
      plugins?: { paths?: string[] };
    };
    const envLocal = await readFile(join(workspaceDir, ".env.local"), "utf8");

    expect(runtime.provider.defaultModel).toBe("gpt-4o-mini");
    expect(runtime.provider.sdk.providerMode).toBe("byok");
    expect(runtime.provider.sdk.authMode).toBe("none");
    expect(runtime.provider.sdk.maxSubagentParallelism).toBe(2);
    expect(runtime.provider.sdk.byok?.baseUrlEnvVar).toBe("COPILOT_SDK_BASE_URL");
    expect(runtime.provider.sdk.byok?.apiKeyEnvVar).toBe("COPILOT_SDK_API_KEY");
    expect(runtime.pipeline.stageOrder).toEqual([
      "stage.orientation",
      "stage.signal",
      "stage.observability"
    ]);
    expect(runtime.plugins?.paths).toContain("./plugins/custom.ts");
    expect(envLocal).toContain("DREAM_ADAPTER_ID=adapter.jsonl.event");
    expect(envLocal).toContain("DREAM_BACKEND_ID=backend.copilot.memory");
    expect(envLocal).toContain("COPILOT_SDK_BASE_URL=http://localhost:11434/v1");
    expect(envLocal).toContain("COPILOT_SDK_API_KEY=local-token");
    expect(envLocal).toContain("COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS=32768");
    expect(envLocal).toContain("COPILOT_SDK_MAX_PROMPT_TOKENS=4096");
    expect(envLocal).toContain("COPILOT_SDK_MAX_SUBAGENT_PARALLELISM=2");
    expect(envLocal).toContain("DREAM_PLUGIN_PATHS=./plugins/custom.ts");
  });

  it("defaults max prompt tokens to context length when prompt tokens are omitted", async () => {
    const workspaceDir = await tempWorkspace();

    await runSetupWizard(workspaceDir, {
      yes: true,
      adapter: "adapter.jsonl.event",
      backend: "backend.copilot.memory",
      providerMode: "byok",
      authMode: "none",
      model: "gpt-4o-mini",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "local-token",
      contextLength: "32768",
      maxSubagentParallelism: "2",
      pluginPath: ["./plugins/custom.ts"],
      stageOrder: "stage.orientation,stage.signal,stage.observability",
      verify: false
    });

    const envLocal = await readFile(join(workspaceDir, ".env.local"), "utf8");
    expect(envLocal).toContain("COPILOT_SDK_MAX_CONTEXT_WINDOW_TOKENS=32768");
    expect(envLocal).toContain("COPILOT_SDK_MAX_PROMPT_TOKENS=32768");
  });
});