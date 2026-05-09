import { runDream } from "./run-dream.js";

export async function runScheduled(
  workspaceDir: string,
  intervalMs: number,
  once: boolean
): Promise<void> {
  await runDream(workspaceDir);
  if (once) return;
  setInterval(() => {
    void runDream(workspaceDir);
  }, intervalMs);
}
