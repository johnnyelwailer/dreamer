import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverClaudeCodeLogPath, discoverCodexTraceLogPath } from "../../src/dream/adapter-log-discovery.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("adapter log discovery", () => {
  it("prefers ~/.claude/history.jsonl when present", () => {
    const home = makeTempHome();
    const history = join(home, ".claude", "history.jsonl");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(history, '{"display":"hello"}\n', "utf8");
    expect(discoverClaudeCodeLogPath(home)).toBe(history);
  });

  it("falls back to newest Claude jsonl when history file is absent", () => {
    const home = makeTempHome();
    const older = writeJsonl(home, join(".claude", "projects", "a"), "old.jsonl", 1000);
    const newer = writeJsonl(home, join(".claude", "projects", "b"), "new.jsonl", 2000);
    expect(discoverClaudeCodeLogPath(home)).toBe(newer);
    expect(discoverClaudeCodeLogPath(home)).not.toBe(older);
  });

  it("prefers ~/.codex/history.jsonl and falls back to newest session log", () => {
    const home = makeTempHome();
    const codexDir = join(home, ".codex");
    mkdirSync(codexDir, { recursive: true });
    const session = writeJsonl(home, join(".codex", "sessions", "2026", "05", "09"), "rollout.jsonl", 2000);
    expect(discoverCodexTraceLogPath(home)).toBe(session);
    const history = join(codexDir, "history.jsonl");
    writeFileSync(history, '{"text":"hi"}\n', "utf8");
    expect(discoverCodexTraceLogPath(home)).toBe(history);
  });

  it("supports override mode for custom discovery paths", () => {
    const home = makeTempHome();
    const customDir = join(home, "custom");
    const customClaude = writeJsonl(home, "custom", "claude.jsonl", 5000);
    const defaultClaude = writeJsonl(home, join(".claude", "projects"), "default.jsonl", 8000);
    const actualClaude = discoverClaudeCodeLogPath({
      homeDir: home,
      mode: "override",
      searchPaths: [customDir]
    });

    const customCodex = writeJsonl(home, "custom", "codex.jsonl", 6000);
    const defaultCodex = writeJsonl(home, join(".codex", "sessions"), "default.jsonl", 9000);
    const actualCodex = discoverCodexTraceLogPath({
      homeDir: home,
      mode: "override",
      searchPaths: [customDir]
    });

    expect(actualClaude).toBe(customClaude);
    expect(actualClaude).not.toBe(defaultClaude);
    expect(actualCodex).toBe(customCodex);
    expect(actualCodex).not.toBe(defaultCodex);
  });
});

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "dreamer-home-"));
  tempDirs.push(dir);
  return dir;
}

function writeJsonl(home: string, relativeDir: string, file: string, mtimeMs: number): string {
  const dir = join(home, relativeDir);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, file);
  writeFileSync(full, '{"message":"x"}\n', "utf8");
  const t = new Date(mtimeMs);
  utimesSync(full, t, t);
  return full;
}