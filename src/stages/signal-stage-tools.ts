import type { InsightRecord } from "../core/types.js";
import type { WrittenSession } from "./signal-stage-file-writer.js";
import { createFinalizeSignalExtractionTool, createRecordInsightTool } from "./signal-stage-insight-tools.js";
import { createGetMessageDetailsTool, createReadFileTool } from "./signal-stage-read-tools.js";
export function createSignalTools(
  runDir: string,
  sessions: WrittenSession[],
  onInsight: (insight: InsightRecord) => void,
  sessionHint?: { sessionId?: string; sessionReference?: string },
  onFinalize?: (verdict: { status: string; summary: string }) => void
) {
  return [
    createReadFileTool(runDir),
    createGetMessageDetailsTool(sessions),
    createRecordInsightTool(onInsight, sessionHint),
    createFinalizeSignalExtractionTool(onFinalize)
  ];
}
