import { describe, expect, it } from "vitest";
import { PluginRegistry } from "../../src/core/registry.js";

describe("PluginRegistry", () => {
  it("loads plugins by id", () => {
    const registry = new PluginRegistry();
    registry.registerStage({ id: "stage.x", run: async (ctx) => ctx });
    expect(registry.requireStage("stage.x").id).toBe("stage.x");
  });

  it("throws actionable errors on missing plugin ids", () => {
    const registry = new PluginRegistry();
    expect(() => registry.requireAdapter("adapter.missing")).toThrow(
      "Missing adapter plugin: adapter.missing"
    );
  });
});
