import { describe, expect, it } from "vitest";
import { PluginRegistry } from "../../src/core/registry.js";
import { buildContext } from "../../src/dream/build-context.js";

describe("PluginRegistry", () => {
  it("loads plugins by id", () => {
    const registry = new PluginRegistry();
    registry.registerStage({ id: "stage.x", run: async (ctx) => ctx });
    expect(registry.requireStage("stage.x").id).toBe("stage.x");
  });

  it("registers legacy stages as matching stage slots and default implementations", async () => {
    const registry = new PluginRegistry();
    const calls: string[] = [];
    registry.registerStage({
      id: "stage.signal",
      run: async (ctx) => {
        calls.push("stage.signal");
        return ctx;
      }
    });

    expect(registry.requireStageSlot("slot.signal").defaultImplementationId).toBe("stage.signal");
    expect(registry.requireStageSlot("slot.signal").inputShape).toEqual(["events", "memories", "docs"]);
    expect(registry.requireStageSlot("slot.signal").outputShape).toEqual(["signals", "insights", "reports"]);
    expect(registry.requireStageSlot("stage.signal").id).toBe("slot.signal");
    expect(registry.implementationsForSlot("slot.signal").map((implementation) => implementation.id)).toEqual([
      "stage.signal"
    ]);

    const stage = registry.requireStageForSlot("stage.signal");
    const context = buildContext("/tmp/workspace", "run-test");
    await stage.run(context);

    expect(stage.id).toBe("slot.signal");
    expect(calls).toEqual(["stage.signal"]);
  });

  it("supports explicitly registered stage implementations", () => {
    const registry = new PluginRegistry();
    registry.registerStageSlot({
      id: "slot.consolidation",
      defaultImplementationId: "impl.consolidation.local",
      inputShape: ["insights"],
      outputShape: ["memories"]
    });
    registry.registerStageImplementation({
      id: "impl.consolidation.local",
      slots: ["slot.consolidation"],
      run: async ({ context }) => ({ context })
    });

    expect(registry.requireStageImplementation("impl.consolidation.local").slots).toEqual(["slot.consolidation"]);
    expect(registry.implementationsForSlot("slot.consolidation")).toHaveLength(1);
  });

  it("rejects implementation-slot mismatches", () => {
    const registry = new PluginRegistry();
    registry.registerStageSlot({
      id: "slot.signal",
      defaultImplementationId: "impl.signal.test",
      inputShape: ["events"],
      outputShape: ["insights"]
    });
    registry.registerStageImplementation({
      id: "impl.signal.test",
      slots: ["slot.consolidation"],
      run: async ({ context }) => ({ context })
    });

    expect(() => registry.requireStageForSlot("slot.signal")).toThrow(
      "Stage implementation impl.signal.test cannot run for slot slot.signal"
    );
  });

  it("throws actionable errors on missing plugin ids", () => {
    const registry = new PluginRegistry();
    expect(() => registry.requireAdapter("adapter.missing")).toThrow(
      "Missing adapter plugin: adapter.missing"
    );
  });
});
