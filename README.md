# Dreamer

Dreamer is a local-first, pluggable system that reflects on AI coding sessions and turns them into durable memory plus reusable project documentation.

## Why This Exists

Coding agents are fast, but project context is fragile. Important decisions, fixes, and patterns get buried in session history.

Dreamer is built to make those lessons durable so future sessions can start with stronger context instead of relearning the same things.

## How It Works (Basic Pipeline)

At a high level, one dream run does this:

1. Ingest transcript events from one or more sources.
2. Detect important signals (decisions, fixes, pitfalls, preferences).
3. Consolidate those signals into structured memory records.
4. Optionally generate project documentation and reports (currently not implemented and not the current focus).

Outputs are written to generated docs, reports, and the selected memory backend or backends.

For a detailed stage-by-stage view, see [docs/generated/pipeline-stages.md](docs/generated/pipeline-stages.md).

## Requirements

Before your first run, decide:

- Intelligence provider mode: Copilot or BYOK/OpenAI-compatible endpoint.
- Memory backend: file, Copilot memory, or Honcho.
- Transcript source: choose one of the currently supported adapters.

Currently supported transcript adapters:

- Copilot debug sessions (`adapter.copilot.debug`)
- Codex trace sessions (`adapter.codex.trace`)
- Claude Code traces (`adapter.claude.code`)
- Generic JSONL event logs (`adapter.jsonl.event`)

See [docs/getting-started.md](docs/getting-started.md) for setup flow and [docs/plugins.md](docs/plugins.md) for extending adapters/backends/providers.

## Most Important Commands

Install dependencies:

```bash
pnpm install
```

Run one dream cycle:

```bash
pnpm dream
```

Optional first-time configuration:

```bash
pnpm dev setup
```

## Features And Implementation Status

- Basic dreaming pipeline (ingest -> signal -> consolidate -> report): implemented
- Local-first workflow with isolated run mode: implemented
- Multiple transcript adapters: implemented
- Multiple memory backends (file, Copilot, Honcho, including fan-out writes): implemented
- Plugin system (adapters/backends/stages/providers): implemented, still evolving
- Runtime/provider matrix hardening across all combinations: partial
- Long-running scheduling and production hardening: partial

Testing notes (important):

- Most features are currently not thoroughly tested.
- Transcript adapter testing is limited today: Copilot is tested; Codex and Claude adapters are currently untested.

## Future Improvements

- Clear multi-backend merge/sync semantics and possible read/write role separation per backend.
- Broader ecosystem support, including validated Codex and Claude flows plus OpenCode-style memory integration.
- Self-documentation and self-refinement stages (for example AGENTS/Claude guidance and skills auto-refinement as follow-up stages).

## Read More

- Getting started and setup details: [docs/getting-started.md](docs/getting-started.md)
- Product vision and goals: [docs/prd.md](docs/prd.md)
- Plugin authoring and loading: [docs/plugins.md](docs/plugins.md)
- Pipeline stage deep dive: [docs/generated/pipeline-stages.md](docs/generated/pipeline-stages.md)
- Environment template: [.env.example](.env.example)
