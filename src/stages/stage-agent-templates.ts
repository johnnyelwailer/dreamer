import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { resolveAssetPath } from "../dream/dreamer-home.js";

export async function loadStageTemplate(workspaceDir: string, templatePath: string, fallback: string): Promise<string> {
  const absolutePath = isAbsolute(templatePath) ? templatePath : join(workspaceDir, templatePath);
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    try {
      return await readFile(resolveAssetPath(templatePath), "utf8");
    } catch {
      return fallback;
    }
  }
}

export function renderStageTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}
