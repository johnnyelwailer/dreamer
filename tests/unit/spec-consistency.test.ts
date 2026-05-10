import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const MAX_SOURCE_LINES = 150;

async function listTypeScriptFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(full);
      }
    }
  }

  await walk(rootDir);
  return files;
}

describe("spec consistency", () => {
  it("keeps source files at or below 150 lines", async () => {
    const root = process.cwd();
    const files = await listTypeScriptFiles(join(root, "src"));
    const violations: string[] = [];

    for (const filePath of files) {
      const lines = (await readFile(filePath, "utf8")).split("\n").length;
      if (lines > MAX_SOURCE_LINES) {
        violations.push(`${relative(root, filePath)}:${lines}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        [
          `Source file limit exceeded (${MAX_SOURCE_LINES} lines).`,
          "DO NOT compress code to stay under the limit.",
          "Split files immediately by responsibility.",
          "Violations:",
          ...violations.map((v) => `- ${v}`)
        ].join("\n")
      );
    }

    expect(violations).toEqual([]);
  });
});
