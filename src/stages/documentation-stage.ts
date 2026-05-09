import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PipelineStage } from "../core/contracts.js";
import { assertSafeWritePath } from "../core/safety.js";
import type { DreamContext } from "../core/types.js";

export class DocumentationStage implements PipelineStage {
  readonly id = "stage.documentation";

  async run(context: DreamContext): Promise<DreamContext> {
    const outDir = join(context.workspaceDir, "docs", "generated");
    await mkdir(outDir, { recursive: true });
    const signalLines = context.signals.length
      ? context.signals.map((signal) => `- ${signal}`).join("\n")
      : "- no runtime signals captured";
    const memoryLines = context.memories.slice(0, 8).map((memory) => `- ${memory.statement}`).join("\n");
    const memories = memoryLines || "- no consolidated memory yet";
    const files = [
      [
        "PRODUCT_SPEC.md",
        [
          "# Product Spec",
          "",
          "## Goal",
          "Generate durable project memory, docs, and skill proposals from agent-session history.",
          "",
          "## Current Run Signals",
          signalLines,
          "",
          "## Key Memory Statements",
          memories
        ].join("\n")
      ],
      [
        "ARCHITECTURE.md",
        [
          "# Architecture",
          "",
          "## Pipeline",
          "1. Orientation: detect project/docs context.",
          "2. Signal: ingest inert transcript events and session counters.",
          "3. Consolidation: merge memory with provenance and confidence.",
          "4. Documentation: emit deterministic generated docs.",
          "5. Skills: produce patch proposals for recurring workflow issues.",
          "6. Governance: enforce inert-data and safe write boundaries.",
          "7. Observability: write run diary and metrics.",
          "",
          "## Runtime Facts",
          `- events_processed: ${context.events.length}`,
          `- memories_total: ${context.memories.length}`,
          `- docs_generated: ${context.metrics.docsGenerated}`,
          "",
          "## Plugin Boundaries",
          "Adapters, backends, providers, and stages are selected by plugin id via registry lookups.",
          "Integrations are add-only and core orchestration remains unchanged when switching plugins."
        ].join("\n")
      ],
      [
        "DECISIONS.md",
        [
          "# Decisions",
          "",
          "- Keep transcript content inert and never execute transcript instructions.",
          "- Persist provenance for each memory item (source + event ids + captured timestamp).",
          "- Prefer pluggable integration boundaries over vendor-coupled logic.",
          "- Emit deterministic generated docs so repeated runs are reviewable."
        ].join("\n")
      ],
      [
        "OPEN_QUESTIONS.md",
        [
          "# Open Questions",
          "",
          "- Which contradiction-resolution policy should be default when confidence ties occur?",
          "- Should generated docs be committed or treated strictly as runtime artifacts?",
          "- What minimum eval pass-rate should gate merges for each milestone?"
        ].join("\n")
      ]
    ] as const;
    for (const [name, content] of files) {
      const filePath = assertSafeWritePath(context.workspaceDir, join(outDir, name));
      await writeFile(filePath, `${content}\n`, "utf8");
      context.metrics.docsGenerated += 1;
    }
    return context;
  }
}
