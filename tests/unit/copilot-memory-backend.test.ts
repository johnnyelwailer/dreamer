import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CopilotMemoryBackend,
  resolveCopilotDestinationPath,
} from "../../src/backends/copilot-memory-backend.js";
import type { MemoryRecord } from "../../src/core/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await import("node:fs/promises").then(({ rm }) =>
        rm(dir, { recursive: true, force: true }),
      );
    }),
  );
  delete process.env.APPDATA;
  delete process.env.VSCODE_TARGET_SESSION_LOG;
});

async function tempRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function memory(
  statement: string,
  scope: MemoryRecord["scope"],
  category: string,
): MemoryRecord {
  return {
    id: `id-${statement.replace(/\s+/g, "-").toLowerCase()}`,
    scope,
    statement,
    confidence: 0.85,
    provenance: {
      source: "test",
      eventIds: ["e-1"],
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
    context: {
      category: category as MemoryRecord["context"] extends {
        category?: infer C;
      }
        ? C
        : never,
    },
  };
}

describe("CopilotMemoryBackend", () => {
  it("writes memory-root records split by category and scope", async () => {
    const root = await tempRoot("dreamer-copilot-memory-");
    await mkdir(join(root, "repo"), { recursive: true });
    await mkdir(join(root, "session"), { recursive: true });

    const backend = new CopilotMemoryBackend(process.cwd(), root);
    await backend.save([
      memory("Prefer terse responses", "user", "communication"),
      memory("Keep architecture docs updated", "workspace", "architecture"),
      memory("Retry flaky eval once", "session", "workflow"),
    ]);

    const userFile = await readFile(join(root, "communication.md"), "utf8");
    const repoFile = await readFile(
      join(root, "repo", "architecture.md"),
      "utf8",
    );
    const sessionFile = await readFile(
      join(root, "session", "workflow.md"),
      "utf8",
    );

    expect(userFile).toContain("- Prefer terse responses");
    expect(repoFile).toContain("- Keep architecture docs updated");
    expect(sessionFile).toContain("- Retry flaky eval once");
    expect(userFile).not.toContain("dreamer:records:start");
    expect(repoFile).not.toContain("dreamer:records:start");
  });

  it("merges with existing markdown bullets instead of replacing files", async () => {
    const root = await tempRoot("dreamer-copilot-memory-");
    await mkdir(join(root, "repo"), { recursive: true });

    await writeFile(join(root, "tooling.md"), "- Existing user rule\n", "utf8");
    await writeFile(
      join(root, "repo", "quality.md"),
      "- Existing repo rule\n",
      "utf8",
    );

    const backend = new CopilotMemoryBackend(process.cwd(), root);
    await backend.save([
      memory("Use pnpm", "user", "tooling"),
      memory("Existing user rule", "user", "tooling"),
      memory("Add regression tests", "workspace", "quality"),
    ]);

    const userFile = await readFile(join(root, "tooling.md"), "utf8");
    const repoFile = await readFile(join(root, "repo", "quality.md"), "utf8");

    expect(userFile).toContain("- Existing user rule");
    expect(userFile).toContain("- Use pnpm");
    expect(userFile.match(/Existing user rule/g)?.length).toBe(1);

    expect(repoFile).toContain("- Existing repo rule");
    expect(repoFile).toContain("- Add regression tests");
  });

  it("keeps workspace-scope writes out of global storage when target path is the global Copilot root", async () => {
    const appDataRoot = await tempRoot("dreamer-appdata-");
    process.env.APPDATA = appDataRoot;

    const globalRoot = join(
      appDataRoot,
      "Code",
      "User",
      "globalStorage",
      "github.copilot-chat",
      "memory-tool",
      "memories",
    );
    const workspaceRoot = join(
      appDataRoot,
      "Code",
      "User",
      "workspaceStorage",
      "test-hash",
      "GitHub.copilot-chat",
      "memory-tool",
      "memories",
    );
    await mkdir(globalRoot, { recursive: true });
    process.env.VSCODE_TARGET_SESSION_LOG = join(
      appDataRoot,
      "Code",
      "User",
      "workspaceStorage",
      "test-hash",
      "GitHub.copilot-chat",
      "debug-logs",
      "session.log",
    );

    const backend = new CopilotMemoryBackend(process.cwd(), globalRoot);
    await backend.save([
      memory("Global user preference", "user", "communication"),
      memory("Repo-only workflow rule", "workspace", "workflow"),
    ]);

    const globalUserFile = await readFile(
      join(globalRoot, "communication.md"),
      "utf8",
    );
    const workspaceRepoFile = await readFile(
      join(workspaceRoot, "repo", "workflow.md"),
      "utf8",
    );

    expect(globalUserFile).toContain("- Global user preference");
    expect(workspaceRepoFile).toContain("- Repo-only workflow rule");
    expect(
      resolveCopilotDestinationPath(
        process.cwd(),
        "workspace",
        "workflow",
        globalRoot,
      ),
    ).toBe(join(workspaceRoot, "repo", "workflow.md"));
    await expect(
      readFile(join(globalRoot, "repo", "workflow.md"), "utf8"),
    ).rejects.toThrow();
  });
});
