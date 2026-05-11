import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ttyWriteLine, ttyWriteTagged } from "../src/shared/tty-log-format.js";

type SafeRunOptions = {
  command: string;
  branchPrefix: string;
  keepWorktree: boolean;
  allowDirtyWorkspace: boolean;
  isolationMode: "repo-worktree" | "none";
};

function parseArgs(argv: string[]): SafeRunOptions {
  const options: SafeRunOptions = {
    command: "pnpm improve:dream",
    branchPrefix: "dreamer/agent",
    keepWorktree: true,
    allowDirtyWorkspace: false,
    isolationMode: process.env.DREAM_WORKSPACE_ISOLATION_MODE === "none" ? "none" : "repo-worktree"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--command") {
      options.command = argv[i + 1] ?? options.command;
      i += 1;
      continue;
    }
    if (arg === "--branch-prefix") {
      options.branchPrefix = argv[i + 1] ?? options.branchPrefix;
      i += 1;
      continue;
    }
    if (arg === "--cleanup") {
      options.keepWorktree = false;
      continue;
    }
    if (arg === "--allow-dirty") {
      options.allowDirtyWorkspace = true;
      continue;
    }
    if (arg === "--isolation") {
      const value = argv[i + 1];
      if (value === "none" || value === "repo-worktree") {
        options.isolationMode = value;
        i += 1;
      }
      continue;
    }
    if (arg === "--no-isolation") {
      options.isolationMode = "none";
      continue;
    }
  }

  return options;
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL ?? "/dev/null"
    }
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || `Command failed: ${command} ${args.join(" ")}`);
  }
  return (result.stdout ?? "").trim();
}

function assertGitRepo(workspaceDir: string): void {
  run("git", ["rev-parse", "--is-inside-work-tree"], workspaceDir);
}

function assertCleanWorkspace(workspaceDir: string): void {
  const status = run("git", ["status", "--porcelain"], workspaceDir);
  if (status.length > 0) {
    throw new Error(
      "Workspace has uncommitted changes. Commit/stash first, or run with --allow-dirty to proceed intentionally."
    );
  }
}

function ensureBranchAvailable(workspaceDir: string, branch: string): void {
  const existing = spawnSync("git", ["show-ref", "--verify", `refs/heads/${branch}`], {
    cwd: workspaceDir,
    encoding: "utf8"
  });
  if (existing.status === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
}

function createBranchName(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}-${stamp}`;
}

function main(): void {
  const workspaceDir = process.cwd();
  const options = parseArgs(process.argv.slice(2));

  if (options.isolationMode === "none") {
    const directResult = spawnSync("zsh", ["-lc", options.command], {
      cwd: workspaceDir,
      stdio: "inherit",
      env: {
        ...process.env,
        DREAMER_WORKSPACE_DIR: process.env.DREAMER_WORKSPACE_DIR ?? workspaceDir
      }
    });
    ttyWriteLine();
    ttyWriteTagged("safe workspace", "run complete (isolation=none)");
    ttyWriteLine(`Command: ${options.command}`);
    if (directResult.status !== 0) {
      process.exitCode = directResult.status ?? 1;
    }
    return;
  }

  assertGitRepo(workspaceDir);
  if (!options.allowDirtyWorkspace) assertCleanWorkspace(workspaceDir);

  const branch = createBranchName(options.branchPrefix);
  ensureBranchAvailable(workspaceDir, branch);

  const sandboxRoot = mkdtempSync(join(tmpdir(), "dreamer-safe-"));
  const worktreeDir = join(sandboxRoot, "workspace");

  run("git", ["worktree", "add", "-b", branch, worktreeDir, "HEAD"], workspaceDir);

  // The dreamer runs from its own source dir (node_modules here). The worktree
  // is just an isolated copy of the workspace files — passed via env var.
  const commandResult = spawnSync("zsh", ["-lc", options.command], {
    cwd: workspaceDir,
    stdio: "inherit",
    env: {
      ...process.env,
      DREAMER_WORKSPACE_DIR: worktreeDir,
      DREAMER_SAFE_WORKTREE: worktreeDir
    }
  });

  ttyWriteLine();
  ttyWriteTagged("safe workspace", "run complete");
  ttyWriteLine(`Branch: ${branch}`);
  ttyWriteLine(`Worktree: ${worktreeDir}`);
  ttyWriteLine(`Command: ${options.command}`);

  if (!options.keepWorktree) {
    run("git", ["worktree", "remove", worktreeDir, "--force"], workspaceDir);
    run("git", ["branch", "-D", branch], workspaceDir);
    rmSync(sandboxRoot, { recursive: true, force: true });
    ttyWriteTagged("safe workspace", "cleanup complete");
  } else {
    ttyWriteTagged("safe workspace", "review changes in the isolated worktree before merging");
  }

  if (commandResult.status !== 0) {
    process.exitCode = commandResult.status ?? 1;
  }
}

main();
