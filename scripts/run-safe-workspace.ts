import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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
    allowDirtyWorkspace: false
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

  assertGitRepo(workspaceDir);
  if (!options.allowDirtyWorkspace) assertCleanWorkspace(workspaceDir);

  const branch = createBranchName(options.branchPrefix);
  ensureBranchAvailable(workspaceDir, branch);

  const sandboxRoot = mkdtempSync(join(tmpdir(), "dreamer-safe-"));
  const worktreeDir = join(sandboxRoot, "workspace");

  run("git", ["worktree", "add", "-b", branch, worktreeDir, "HEAD"], workspaceDir);

  const commandResult = spawnSync("zsh", ["-lc", options.command], {
    cwd: worktreeDir,
    stdio: "inherit",
    env: {
      ...process.env,
      HOME: sandboxRoot,
      USERPROFILE: sandboxRoot,
      DREAMER_SAFE_WORKTREE: worktreeDir,
      DREAMER_ORIGINAL_HOME: process.env.HOME ?? ""
    }
  });

  console.log("\nSafe workspace run complete.");
  console.log(`Branch: ${branch}`);
  console.log(`Worktree: ${worktreeDir}`);
  console.log(`Command: ${options.command}`);

  if (!options.keepWorktree) {
    run("git", ["worktree", "remove", worktreeDir, "--force"], workspaceDir);
    run("git", ["branch", "-D", branch], workspaceDir);
    rmSync(sandboxRoot, { recursive: true, force: true });
    console.log("Cleanup complete.");
  } else {
    console.log("Review changes in the isolated worktree before merging.");
  }

  if (commandResult.status !== 0) {
    process.exitCode = commandResult.status ?? 1;
  }
}

main();
