import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { PluginRegistry } from "../../src/core/registry.js";
import { loadDreamerPlugins, readDreamerPluginPathsFromEnv } from "../../src/dream/plugin-loader.js";
import { buildContext } from "../../src/dream/build-context.js";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.DREAM_PLUGIN_PATHS;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dreamer-plugin-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("dreamer plugin loader", () => {
  it("loads TypeScript plugin modules that register stages", async () => {
    const dir = await tempDir();
    const pluginPath = join(dir, "custom-dreaming.ts");
    await writeFile(
      pluginPath,
      `
        export function registerDreamerPlugin(registry) {
          registry.registerStage({
            id: "stage.custom-dreaming",
            async run(context) {
              context.diary.push("custom-dreaming:events=" + context.events.length);
              return context;
            }
          });
        }
      `,
      "utf8"
    );

    const registry = new PluginRegistry();
    const loaded = await loadDreamerPlugins(registry, { workspaceDir: dir, pluginPaths: [pluginPath] });
    const context = buildContext(dir, "run-test");
    context.events = [
      {
        id: "event-1",
        timestamp: "2026-05-10T00:00:00.000Z",
        source: "test",
        kind: "message",
        text: "hello",
        metadata: {}
      }
    ];

    const result = await registry.requireStage("stage.custom-dreaming").run(context);
    expect(loaded).toEqual([{ path: pluginPath }]);
    expect(result.diary).toContain("custom-dreaming:events=1");
  });

  it("reads plugin paths from comma or platform-delimited env values", () => {
    process.env.DREAM_PLUGIN_PATHS = `one,two${process.platform === "win32" ? ";" : ":"}three`;
    expect(readDreamerPluginPathsFromEnv()).toEqual(["one", "two", "three"]);
  });
});
