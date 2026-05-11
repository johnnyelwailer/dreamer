import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupMemoryBeforeRun } from "../../src/dream/memory-backup.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

async function tempWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("backupMemoryBeforeRun", () => {
  it("backs up external copilot memory directories before run", async () => {
    const workspaceDir = await tempWorkspace("dreamer-backup-ws-");
    const externalRoot = await tempWorkspace("dreamer-backup-external-");
    const copilotRoot = join(externalRoot, "memories");
    await mkdir(join(copilotRoot, "repo"), { recursive: true });
    await writeFile(join(copilotRoot, "repo", "rules.md"), "- Keep references precise\n", "utf8");

    const result = await backupMemoryBeforeRun(workspaceDir, "run-123", {
      backendId: "backend.copilot.memory",
      copilotMemoryPath: copilotRoot,
      honchoExportPath: join(workspaceDir, ".dreamer", "honcho.json"),
      memoryBackupEnabled: true,
      memoryBackupDir: join(workspaceDir, ".dreamer", "backups", "memories"),
      memoryBackupExternalOnly: true
    });

    expect(result).toBeDefined();
    expect(result?.items.length).toBe(1);
    expect(result?.items[0]?.externalToDreamerStorage).toBe(true);
    await expect(stat(join(result?.backupDir ?? "", "manifest.json"))).resolves.toBeDefined();
    const copied = await readFile(join(result?.backupDir ?? "", "external", "memories", "repo", "rules.md"), "utf8");
    expect(copied).toContain("Keep references precise");
  });

  it("skips backup when only internal targets exist and external-only is enabled", async () => {
    const workspaceDir = await tempWorkspace("dreamer-backup-ws-");

    const result = await backupMemoryBeforeRun(workspaceDir, "run-124", {
      backendId: "backend.file.memory",
      copilotMemoryPath: "",
      honchoExportPath: join(workspaceDir, ".dreamer", "honcho.json"),
      memoryBackupEnabled: true,
      memoryBackupDir: join(workspaceDir, ".dreamer", "backups", "memories"),
      memoryBackupExternalOnly: true
    });

    expect(result).toBeUndefined();
  });
});
