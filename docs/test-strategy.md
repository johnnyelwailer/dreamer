# Test Strategy

## Objectives

- Enforce TDD for all slices.
- Protect pluggable contracts across implementations.
- Verify end-to-end behavior for each vertical slice.
- Keep tests maintainable with small, focused files.

## Test Pyramid

- Unit tests: contracts, transforms, merge policies, risk classifiers.
- Integration tests: adapter to pipeline to backend/doc output.
- Golden tests: deterministic outputs for events and generated docs.
- Safety tests: prompt injection inert-data handling, write isolation.

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

## Slice 3

- Generated docs contain required sections.
- Re-run with unchanged input yields minimal/no diff.
- AGENTS concision guard blocks oversized output.

## Slice 4

- Detection rules trigger on repeated retries.
- Proposal artifacts validate against schema.
- High-risk proposals require explicit approval path.

## Slice 5

- Contract suite runs unchanged for each plugin implementation.
- Plugin switching works through config only.

## Slice 6

- Scheduler triggers runs by configured interval.
- Diary includes required run metadata.
- Transcript instructions are treated as inert text.
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
- 1 golden test for each generated document type.
- 1 negative safety test for each governance rule.
