import type { DreamQualityRubricConfig, EvalCaseConfig } from "./runtime-manifest-types.js";
import { resolveAssetPath } from "./dreamer-home.js";

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) throw new Error(`Invalid runtime manifest field: ${field}`);
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Invalid runtime manifest field: ${field}`);
  }
  return value;
}

export function parseEvalCasesObject(parsed: unknown, fieldPrefix: string): EvalCaseConfig[] {
  if (!Array.isArray(parsed)) throw new Error(`Eval cases must be an array: ${fieldPrefix}`);
  return parsed.map((item, index) => {
    const record = item as Record<string, unknown>;
    return {
      id: asString(record.id, `${fieldPrefix}[${index}].id`),
      prompt: asString(record.prompt, `${fieldPrefix}[${index}].prompt`),
      mustContain: asStringArray(record.mustContain, `${fieldPrefix}[${index}].mustContain`)
    };
  });
}

export function parseDreamQualityRubricObject(parsed: unknown, fieldPrefix: string): DreamQualityRubricConfig {
  const record = parsed as Record<string, unknown>;
  const dimensions = record.dimensions as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error(`Invalid dream quality rubric dimensions: ${fieldPrefix}`);
  }
  return {
    judgePromptTemplatePath: record.judgePromptTemplatePath
      ? asString(record.judgePromptTemplatePath, `${fieldPrefix}.judgePromptTemplatePath`)
      : resolveAssetPath("prompts/dream-quality-judge.md"),
    dimensions: dimensions.map((dimension, index) => ({
      id: asString(dimension.id, `${fieldPrefix}.dimensions[${index}].id`),
      description: asString(dimension.description, `${fieldPrefix}.dimensions[${index}].description`),
      weight: asPositiveNumber(dimension.weight, `${fieldPrefix}.dimensions[${index}].weight`)
    }))
  };
}
