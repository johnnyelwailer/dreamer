import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/** Root of all dreamer data. Override with DREAMER_HOME env var. */
export function dreamerHome(): string {
  return process.env.DREAMER_HOME ?? join(homedir(), ".dreamer");
}

/**
 * Stable 12-char identifier for a workspace, derived from its absolute path.
 * Used as a directory name under dreamerHome()/workspaces/.
 */
export function workspaceId(workspaceDir: string): string {
  return createHash("sha256").update(workspaceDir).digest("hex").slice(0, 12);
}

/**
 * Central storage directory for a workspace.
 * All dreamer writes for a given workspace go here — the target repo is read-only.
 */
export function workspaceStorageDir(workspaceDir: string): string {
  return join(dreamerHome(), "workspaces", workspaceId(workspaceDir));
}

/**
 * Resolve a path to a bundled asset (prompt templates, eval rubrics, etc.)
 * shipped with the dreamer package under src/assets/.
 *
 * Accepts an optional user override: if provided and non-empty, it is returned
 * as-is (callers may supply absolute paths to override bundled defaults).
 */
export function resolveAssetPath(relativePath: string, override?: string): string {
  if (override && override.trim().length > 0) return override;
  return join(import.meta.dirname, "..", "assets", relativePath);
}
