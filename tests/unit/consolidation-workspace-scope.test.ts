import { describe, expect, it } from "vitest";
import {
  inferWorkspaceDirFromSessionIds,
  resolveMemoryScopeBySessionWorkspace,
} from "../../src/stages/consolidation-workspace-scope.js";

describe("resolveMemoryScopeBySessionWorkspace", () => {
  it("keeps user scope unchanged", () => {
    const result = resolveMemoryScopeBySessionWorkspace(
      "user",
      "D:/gh/dreamer",
      new Map([["s1", "D:/other"]]),
      ["s1"],
    );
    expect(result).toEqual({ scope: "user", downgradedSessionIds: [] });
  });

  it("keeps workspace scope for same-workspace sessions", () => {
    const result = resolveMemoryScopeBySessionWorkspace(
      "workspace",
      "D:/gh/dreamer",
      new Map([
        ["s1", "D:/gh/dreamer"],
        ["s2", "d:\\gh\\dreamer\\"],
      ]),
      ["s1", "s2"],
    );
    expect(result).toEqual({ scope: "workspace", downgradedSessionIds: [] });
  });

  it("downgrades workspace scope when any referenced session is from a different workspace", () => {
    const result = resolveMemoryScopeBySessionWorkspace(
      "workspace",
      "D:/gh/dreamer",
      new Map([
        ["s1", "D:/gh/dreamer"],
        ["s2", "D:/gh/another-project"],
      ]),
      ["s1", "s2"],
    );
    expect(result).toEqual({ scope: "user", downgradedSessionIds: ["s2"] });
  });

  it("infers workspace dir when all referenced sessions resolve to one workspace", () => {
    const inferred = inferWorkspaceDirFromSessionIds(
      new Map([
        ["s1", "D:/gh/dreamer"],
        ["s2", "d:\\gh\\dreamer\\"],
      ]),
      ["s1", "s2"],
    );
    expect(inferred).toBe("D:/gh/dreamer");
  });

  it("returns undefined when referenced sessions span different workspaces", () => {
    const inferred = inferWorkspaceDirFromSessionIds(
      new Map([
        ["s1", "D:/gh/dreamer"],
        ["s2", "D:/gh/another"],
      ]),
      ["s1", "s2"],
    );
    expect(inferred).toBeUndefined();
  });
});
