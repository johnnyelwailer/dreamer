import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runConversationQualityEval } from "../src/eval/conversation-quality.js";

// Auto-load .env.local
try {
  const envLocal = await readFile(join(import.meta.dirname, "..", ".env.local"), "utf8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env.local */ }

const workspaceDir = process.env.DREAMER_WORKSPACE_DIR ?? process.cwd();
const report = await runConversationQualityEval(workspaceDir);
console.log(JSON.stringify(report, null, 2));
