import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DreamQualityRubricConfig } from "../dream/runtime-manifest.js";
import type { DreamQualityReport } from "./dream-quality.js";

type JudgeScore = {
  id: string;
  score: number;
  rationale: string;
};

type JudgeResponse = {
  scores: JudgeScore[];
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  parseError?: string;
};

function stripCodeFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? text.trim();
}

function parseJudgeResponse(raw: string): JudgeResponse {
  const cleaned = stripCodeFence(raw);
  let parsed: Partial<JudgeResponse> = {};
  let parseError: string | undefined;
  try {
    parsed = JSON.parse(cleaned) as Partial<JudgeResponse>;
  } catch (error) {
    parseError = `judge_output_parse_error: ${String(error)}`;
  }
  const scores = Array.isArray(parsed.scores)
    ? parsed.scores.filter((score): score is JudgeScore => {
        const record = score as Partial<JudgeScore>;
        return (
          typeof record.id === "string" &&
          typeof record.score === "number" &&
          record.score >= 0 &&
          record.score <= 1 &&
          typeof record.rationale === "string"
        );
      })
    : [];

  return {
    scores,
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((v) => typeof v === "string") : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter((v) => typeof v === "string") : [],
    improvements: Array.isArray(parsed.improvements)
      ? parsed.improvements.filter((v) => typeof v === "string")
      : [],
    parseError
  };
}

export async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

export async function readArtifacts(workspaceDir: string): Promise<Array<{ path: string; content: string }>> {
  const artifactPaths = [
    "reports/dream-diary.md",
    "reports/governance.json",
    "reports/metrics.json",
    "reports/pipeline-log.json",
    ".dreamer/memory.json"
  ];
  const artifacts: Array<{ path: string; content: string }> = [];
  for (const artifactPath of artifactPaths) {
    const content = await readFile(join(workspaceDir, artifactPath), "utf8").catch(() => "");
    if (content.trim().length > 0) artifacts.push({ path: artifactPath, content: content.slice(0, 8000) });
  }
  return artifacts;
}

export function buildRubricText(rubric: DreamQualityRubricConfig): string {
  return rubric.dimensions.map((d) => `- ${d.id} (weight ${d.weight}): ${d.description}`).join("\n");
}

export function buildBundleText(items: Array<{ path: string; content: string }>): string {
  if (!items.length) return "- none";
  return items.map((item) => [`# ${item.path}`, item.content].join("\n")).join("\n\n");
}

export function scoreReport(
  raw: string,
  rubric: DreamQualityRubricConfig,
  minPassingScore: number,
  model: string,
  docs: string[]
): DreamQualityReport {
  const parsed = parseJudgeResponse(raw);
  const byId = new Map(parsed.scores.map((score) => [score.id, score]));
  const totalWeight = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0) || 1;
  const dimensions = rubric.dimensions.map((dimension) => {
    const judge = byId.get(dimension.id);
    const score = judge?.score ?? 0;
    return {
      id: dimension.id,
      score,
      weight: dimension.weight,
      weighted: score * dimension.weight,
      rationale: judge?.rationale ?? "Missing score from evaluator"
    };
  });
  const weightedScore = dimensions.reduce((sum, dimension) => sum + dimension.weighted, 0) / totalWeight;
  return {
    generatedAt: new Date().toISOString(),
    model,
    minPassingScore,
    weightedScore,
    passed: weightedScore >= minPassingScore,
    dimensions,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    improvements: parsed.improvements,
    docsEvaluated: docs,
    rawJudgeOutput: raw,
    judgeParseError: parsed.parseError
  };
}
