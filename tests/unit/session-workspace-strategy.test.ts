import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSessionWorkspaceDecision } from "../../src/stages/session-workspace-strategy.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveSessionWorkspaceDecision", () => {
  it("uses workspace-default mode regardless of session metadata", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-session-workspace-"));
    tempDirs.push(workspaceDir);
    const decision = resolveSessionWorkspaceDecision("workspace-default", workspaceDir, "/tmp/some-session-repo");
    expect(decision).toEqual({ workingDirectory: workspaceDir, source: "workspace-default" });
  });

  it("uses session workspace when available", () => {
    const root = mkdtempSync(join(tmpdir(), "dreamer-session-workspace-"));
    const workspaceDir = join(root, "dream");
    const sessionDir = join(root, "session-repo");
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    tempDirs.push(root);

    const decision = resolveSessionWorkspaceDecision("session-preferred", workspaceDir, sessionDir);
    expect(decision).toEqual({ workingDirectory: sessionDir, source: "session" });
  });

  it("falls back to workspace dir for session-preferred when session path is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "dreamer-session-workspace-"));
    const workspaceDir = join(root, "dream");
    mkdirSync(workspaceDir, { recursive: true });
    tempDirs.push(root);

    const decision = resolveSessionWorkspaceDecision("session-preferred", workspaceDir, join(root, "missing"));
    expect(decision).toEqual({ workingDirectory: workspaceDir, source: "fallback" });
  });

  it("returns missing when session-required has no valid session workspace", () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-session-workspace-"));
    tempDirs.push(workspaceDir);
    const decision = resolveSessionWorkspaceDecision("session-required", workspaceDir, join(workspaceDir, "missing"));
    expect(decision).toEqual({ source: "missing" });
  });
});
