import { defineTool } from "@github/copilot-sdk";
import type { JudgeEvidenceFile } from "./dream-quality-evidence.js";
import { clamp, readLines, summarizeTranscriptLine, validatePayload, type ToolJudgePayload } from "./dream-quality-tool-judge-helpers.js";

export function createEvidenceTools(
  evidenceFiles: JudgeEvidenceFile[],
  rubricDimensionIds: string[],
  onScoresCapture: (payload: ToolJudgePayload) => void
) {
  const allowedEvidencePaths = new Set(evidenceFiles.map((file) => file.path));

  const listEvidenceFilesTool = defineTool("list_quality_evidence_files", {
    description: "List transcript/event evidence files available for quality evaluation.",
    parameters: {
      type: "object",
      properties: {}
    },
    skipPermission: true,
    handler: () => {
      return {
        textResultForLlm: JSON.stringify(evidenceFiles),
        resultType: "success"
      };
    }
  });

  const readEvidenceChunkTool = defineTool("read_quality_evidence_chunk", {
    description: "Read a line range from an allowed evidence file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" }
      },
      required: ["path", "startLine", "endLine"]
    },
    skipPermission: true,
    handler: async (args) => {
      const input = (args ?? {}) as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path : "";
      if (!allowedEvidencePaths.has(path)) {
        return { textResultForLlm: "Path not allowed.", resultType: "error" };
      }
      const lines = await readLines(path);
      const startLine = clamp(Math.floor(Number(input.startLine) || 1), 1, Math.max(lines.length, 1));
      const endLine = clamp(Math.floor(Number(input.endLine) || startLine), startLine, Math.max(lines.length, startLine));
      const slice = lines.slice(startLine - 1, endLine).map((line, index) => ({
        line: startLine + index,
        text: line
      }));
      return {
        textResultForLlm: JSON.stringify({ path, totalLines: lines.length, lines: slice }),
        resultType: "success"
      };
    }
  });

  const searchEvidenceTool = defineTool("search_quality_evidence", {
    description: "Search allowed evidence files for user reactions or assistant behavior cues.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" }
      },
      required: ["path", "query"]
    },
    skipPermission: true,
    handler: async (args) => {
      const input = (args ?? {}) as Record<string, unknown>;
      const path = typeof input.path === "string" ? input.path : "";
      const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
      const limit = clamp(Math.floor(Number(input.limit) || 12), 1, 50);
      if (!allowedEvidencePaths.has(path)) {
        return { textResultForLlm: "Path not allowed.", resultType: "error" };
      }
      if (!query) {
        return { textResultForLlm: "Search query is required.", resultType: "error" };
      }
      const lines = await readLines(path);
      const matches: Array<{ line: number; text: string }> = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (!line.toLowerCase().includes(query)) continue;
        matches.push({ line: index + 1, text: summarizeTranscriptLine(line) });
        if (matches.length >= limit) break;
      }
      return {
        textResultForLlm: JSON.stringify({ path, query, count: matches.length, matches }),
        resultType: "success"
      };
    }
  });

  const submitScoresTool = defineTool("submit_quality_scores", {
    description: "Submit final quality evaluation scores and recommendations.",
    parameters: {
      type: "object",
      properties: {
        scores: { type: "array" },
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } }
      },
      required: ["scores", "strengths", "weaknesses", "improvements"]
    },
    skipPermission: true,
    handler: (args) => {
      try {
        onScoresCapture(validatePayload(args as Record<string, unknown>, rubricDimensionIds));
        return { textResultForLlm: "Scores accepted.", resultType: "success" };
      } catch (error) {
        return {
          textResultForLlm:
            `submit_quality_scores validation failed: ${String(error)}. ` +
            `Expected all rubric ids exactly once: ${rubricDimensionIds.join(", ")}. ` +
            "Score range must be between 0 and 1.",
          resultType: "error"
        };
      }
    }
  });

  return [submitScoresTool, listEvidenceFilesTool, readEvidenceChunkTool, searchEvidenceTool];
}
