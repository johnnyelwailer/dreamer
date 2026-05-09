import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverCopilotDebugSessionDir } from "../../src/dream/copilot-debug-session-discovery.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("discoverCopilotDebugSessionDir", () => {
  it("discovers the latest macOS Copilot debug session automatically", () => {
    const home = makeTempHome();
    const older = createSessionDir({
      home,
      base: join("Library", "Application Support", "Code", "User", "workspaceStorage"),
      workspaceId: "workspace-a",
      sessionId: "session-old",
      mtimeMs: 1000
    });
    const newer = createSessionDir({
      home,
      base: join("Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
      workspaceId: "workspace-b",
      sessionId: "session-new",
      mtimeMs: 2000
    });

    const actual = discoverCopilotDebugSessionDir({
      platform: "darwin",
      homeDir: home,
      env: {}
    });

    expect(actual).not.toBe(older);
    expect(actual).toBe(newer);
  });

  it("discovers sessions from APPDATA on Windows", () => {
    const home = makeTempHome();
    const appData = join(home, "AppData", "Roaming");
    const expected = createSessionDir({
      home,
      base: join("AppData", "Roaming", "Code", "User", "workspaceStorage"),
      workspaceId: "workspace-win",
      sessionId: "session-win",
      mtimeMs: 3000
    });

    const actual = discoverCopilotDebugSessionDir({
      platform: "win32",
      homeDir: home,
      env: { APPDATA: appData }
    });

    expect(actual).toBe(expected);
  });

  it("returns undefined when no global session logs exist", () => {
    const home = makeTempHome();
    const actual = discoverCopilotDebugSessionDir({
      platform: "darwin",
      homeDir: home,
      env: {}
    });
    expect(actual).toBeUndefined();
  });

  it("supports overriding default workspace roots via config", () => {
    const home = makeTempHome();
    const customRoot = join(home, "custom-workspaces");
    const expected = createSessionDir({
      home,
      base: "custom-workspaces",
      workspaceId: "workspace-custom",
      sessionId: "session-custom",
      mtimeMs: 5000
    });

    const actual = discoverCopilotDebugSessionDir({
      platform: "darwin",
      homeDir: home,
      env: {},
      mode: "override",
      searchPaths: [customRoot]
    });

    expect(actual).toBe(expected);
  });

  it("prefers a transcript-rich session over a newer trivial session", () => {
    const home = makeTempHome();
    const newerEmpty = createSessionDir({
      home,
      base: join("Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
      workspaceId: "workspace-a",
      sessionId: "session-empty",
      mtimeMs: 3000
    });
    const richer = createSessionDir({
      home,
      base: join("Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
      workspaceId: "workspace-b",
      sessionId: "session-rich",
      mtimeMs: 2000,
      transcriptLines: [
        JSON.stringify({ type: "user.message", data: { content: "Need a real transcript" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "Working through repo flow" } }),
        JSON.stringify({ type: "tool.execution_start", data: { toolName: "read_file" } })
      ]
    });

    const actual = discoverCopilotDebugSessionDir({
      platform: "darwin",
      homeDir: home,
      env: {}
    });

    expect(actual).not.toBe(newerEmpty);
    expect(actual).toBe(richer);
  });
});

function makeTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "dreamer-home-"));
  tempDirs.push(dir);
  return dir;
}

function createSessionDir(input: {
  home: string;
  base: string;
  workspaceId: string;
  sessionId: string;
  mtimeMs: number;
  transcriptLines?: string[];
}): string {
  const sessionDir = join(
    input.home,
    input.base,
    input.workspaceId,
    "GitHub.copilot-chat",
    "debug-logs",
    input.sessionId
  );
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "main.jsonl"), '{"type":"session_start"}\n', "utf8");
  writeFileSync(join(sessionDir, "models.json"), "[]", "utf8");
  if (input.transcriptLines?.length) {
    const transcriptsDir = join(
      input.home,
      input.base,
      input.workspaceId,
      "GitHub.copilot-chat",
      "transcripts"
    );
    mkdirSync(transcriptsDir, { recursive: true });
    writeFileSync(join(transcriptsDir, `${input.sessionId}.jsonl`), `${input.transcriptLines.join("\n")}\n`, "utf8");
  }
  const d = new Date(input.mtimeMs);
  utimesSync(join(sessionDir, "main.jsonl"), d, d);
  return sessionDir;
}