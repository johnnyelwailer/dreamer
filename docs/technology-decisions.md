# Technology Decisions

## Core Stack

- Language: TypeScript 6.0.3 (strict mode).
- Runtime: Node.js 24 LTS (latest current is 26.1.0).
- Package manager: pnpm 11.0.9.
- Build: tsup 8.5.1 for small CLI builds.
- CLI: commander 14.0.3.
- Validation: zod 4.4.3 for contracts and event schemas.
- Testing: vitest 4.1.5.
- Formatting and linting: eslint 10.3.0 + prettier 3.8.3.

## Why This Stack

- TypeScript + zod helps enforce plugin contracts and input normalization.
- Vitest supports fast TDD loops and snapshot tests for deterministic outputs.
- Node ecosystem has strong local tooling for OpenAI-compatible APIs.
- Small modules are easy to keep below 150 LOC.

## Storage Choices

- Internal run metadata: SQLite (better-sqlite3).
- Event snapshots and fixtures: JSONL in repository fixtures folder.
- Generated docs and reports: markdown in docs/ and reports/.

## Adapter Interface Style

- Contract-first with explicit adapter capabilities.
- Pull-based incremental ingestion with checkpoints.
- Deterministic normalization to a common event schema.

## LLM Provider Interface Style

- OpenAI-compatible client as baseline transport.
- Provider adapter for endpoint-specific auth and model naming.
- Strict timeout, retry, and response-shape validation.

## Guardrails

- Source LOC budget under 150 lines per file.
- One responsibility per module.
- Any breach triggers immediate file split before merge.
- For every new feature, verify all introduced or touched technology versions against latest stable releases before implementation and update this document plus package manifests in the same change.
