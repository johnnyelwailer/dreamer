# Test Strategy

## Objectives

- Enforce TDD for all slices.
- Protect pluggable contracts across implementations.
- Verify end-to-end behavior for each vertical slice.
- Keep tests maintainable with small, focused files.

## Test Pyramid

- Unit tests: contracts, transforms, merge policies, risk classifiers.
- Integration tests: adapter to pipeline to backend/skill output.
- Golden tests: deterministic outputs for events and generated skill patches.
- Safety tests: prompt injection inert-data handling, workspace read-only enforcement, write isolation.

## TDD Workflow

- Step 1: add failing test for visible behavior.
- Step 2: implement minimal code to pass.
- Step 3: refactor while preserving green suite.
- Step 4: add regression test for every discovered bug.

## Test Organization

- tests/unit/contracts/
- tests/unit/core/
- tests/unit/plugins/
- tests/integration/slices/
- tests/fixtures/
- tests/golden/

## Slice Test Matrix

## Slice 0

- Registry loads plugin by id.
- Missing plugin id returns actionable error.
- Pipeline stage order is deterministic.

## Slice 1

- Session parser maps raw records into normalized events.
- Incremental checkpoint skips already processed records.
- Malformed records are skipped with diagnostics.

## Slice 2

- Duplicate memories merge by policy.
- Stale memories prune by rule.
- Contradictions are flagged and preserved.
- Provenance fields are populated on all writes.

---

> **DEFERRED — Slice: Documentation Reconstruction**
>
> Tests for documentation generation are not part of the active test matrix. See the [Deferred Use Case: Documentation Generation](prd.md#deferred-use-case-documentation-generation) section in the PRD.

---

## Slice 3

- Detection rules trigger on repeated retries.
- Proposal artifacts validate against schema.
- High-risk proposals require explicit approval path.

## Slice 4

- Contract suite runs unchanged for each plugin implementation.
- Plugin switching works through config only.

## Slice 5

- Scheduler triggers runs by configured interval.
- Diary includes required run metadata.
- Transcript instructions are treated as inert text.
- Direct workspace filesystem writes are blocked and produce auditable errors.
- Repo-scoped outputs are staged on a separate branch, not the working branch.
- Approval gate cannot be bypassed by the dream run itself.
- Isolation checks block unsafe write paths.

## Quality Gates

- Unit tests pass.
- Integration tests pass for active slice and prior slices.
- Golden snapshot diffs are reviewed intentionally.
- Coverage thresholds by changed files are met.
- No source file exceeds 150 LOC target.

## Determinism Rules

- Freeze clock/time in tests.
- Use stable sort ordering for generated outputs.
- Seed any randomized behavior.
- Normalize paths and timestamps in snapshots.

## CI Recommendations

- Run unit tests on every push.
- Run integration and golden tests on pull requests.
- Block merge on any failing gate.
- Publish dream diary artifact for integration runs.

## Minimal Starter Set

- 1 end-to-end test per slice.
- 3 to 5 unit tests per new module.
- 1 golden test for each generated skill patch type.
- 1 negative safety test for each governance rule.

> **Note:** The 1 golden test for each generated document type belongs to the deferred documentation use case and is not part of the active test matrix.
