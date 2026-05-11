import { runDream } from "./run-dream.js";
import type { RunDreamOptions } from "./run-dream-types.js";

export async function runScheduled(
  workspaceDir: string,
  intervalMs: number,
  once: boolean,
  options: RunDreamOptions = {}
): Promise<void> {
  let running = true;
  await runDream(workspaceDir, options);
  running = false;
  if (once) return;

  setInterval(() => {
    if (running) return;
    running = true;
    void runDream(workspaceDir, options).finally(() => {
      running = false;
    });
  }, intervalMs);
}
