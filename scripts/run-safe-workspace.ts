/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ttyWriteLine, ttyWriteTagged } from "../src/shared/tty-log-format.js";

type ShellCommand = {
  command: string;
  args: string[];
};

type SafeRunOptions = {
  command: string;
  branchPrefix: string;
  keepWorktree: boolean;
  allowDirtyWorkspace: boolean;
};

function parseArgs(argv: string[]): SafeRunOptions {
  const options: SafeRunOptions = {
    command: "pnpm improve:dream",
    branchPrefix: "dreamer/agent",
    keepWorktree: true,
    allowDirtyWorkspace: true,
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
  }

  return options;
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL ?? "/dev/null",
    },
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(
      stderr || stdout || `Command failed: ${command} ${args.join(" ")}`,
    );
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
      "Workspace has uncommitted changes. Commit/stash first, or run with --allow-dirty to proceed intentionally.",
    );
  }
}

function ensureBranchAvailable(workspaceDir: string, branch: string): void {
  const existing = spawnSync(
    "git",
    ["show-ref", "--verify", `refs/heads/${branch}`],
    {
      cwd: workspaceDir,
      encoding: "utf8",
    },
  );
  if (existing.status === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
}

function createBranchName(prefix: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  return `${prefix}-${stamp}`;
}

function getCommandShell(command: string): ShellCommand {
  if (process.platform === "win32") {
    return {
      command: "pwsh",
      args: ["-NoLogo", "-NoProfile", "-Command", command],
    };
  }

  return {
    command: process.env.SHELL || "sh",
    args: ["-lc", command],
  };
}

function main(): void {
  const workspaceDir = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const commandShell = getCommandShell(options.command);

  assertGitRepo(workspaceDir);
  if (!options.allowDirtyWorkspace) assertCleanWorkspace(workspaceDir);

  const branch = createBranchName(options.branchPrefix);
  ensureBranchAvailable(workspaceDir, branch);

  const sandboxRoot = mkdtempSync(join(tmpdir(), "dreamer-safe-"));
  const worktreeDir = join(sandboxRoot, "workspace");

  run(
    "git",
    ["worktree", "add", "-b", branch, worktreeDir, "HEAD"],
    workspaceDir,
  );

  // The dreamer runs from its own source dir (node_modules here). The worktree
  // is just an isolated copy of the workspace files — passed via env var.
  const commandResult = spawnSync(commandShell.command, commandShell.args, {
    cwd: workspaceDir,
    stdio: "inherit",
    env: {
      ...process.env,
      DREAMER_ENV_SOURCE_DIR:
        process.env.DREAMER_ENV_SOURCE_DIR ?? workspaceDir,
      DREAMER_WORKSPACE_DIR: worktreeDir,
      DREAMER_SAFE_WORKTREE: worktreeDir,
    },
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
    ttyWriteTagged(
      "safe workspace",
      "review changes in the isolated worktree before merging",
    );
  }

  if (commandResult.status !== 0) {
    process.exitCode = commandResult.status ?? 1;
  }
}

main();
