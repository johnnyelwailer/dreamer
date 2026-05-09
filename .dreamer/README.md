# .dreamer Directory Guide

This folder contains both repo-owned inputs and local runtime artifacts.

## Commit These

These are durable project inputs used by the app and tests.

- `config/`
  - Runtime config, prompt templates, and eval rubric/cases.
- `fixtures/`
  - Stable sample transcripts/traces used for defaults and tests.
- `test/`
  - Test fixture outputs used by unit/integration tests.

## Temporary / Generated (Do Not Commit)

These are runtime outputs and diagnostics.

- `memory.json`
  - File-memory backend output.
- `state.json`
  - Incremental pipeline state/checkpoint data.
- `copilot-memory.json`
  - Copilot memory backend export.
- `honcho/workspace.json`
  - Local Honcho workspace mirror for diagnostics.

## Practical Rule

If a file under `.dreamer` is written by a backend or by a run, treat it as generated.
If it is configuration or a stable fixture used as input, keep it committed.
