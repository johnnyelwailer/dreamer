# Execution Plan

## Planning Constraints

- Reusable, pluggable code only.
- Target fewer than 150 LOC per file.
- TDD-first: write failing tests before implementation.
- Deliver in vertical slices with end-to-end value.
- Greenfield rule: do not preserve legacy behavior unless explicitly requested.
- Workspaces are always read-only. All mutations go through explicit tool contracts to a central store.

## Milestones

- Milestone A: Slices 0-1
- Milestone B: Slice 2
- Milestone C: Slices 3-4
- Milestone D: Slice 5

## Slice Backlog

## Slice 0 - Kernel and Contracts

### Deliverables

- Plugin contracts for adapters, backends, the Copilot SDK provider, and stages.
- Registry for plugin discovery and binding.
- Minimal dream command with stub plugins.

### Tasks

- Define adapter contract and tests.
- Define backend contract and tests.
- Define provider contract and tests.
- Define stage contract and tests.
- Implement registry load and lookup path.
- Implement no-op pipeline runner.
- Add diagnostics for missing plugin ids.

### Exit Checks

- Contract test suite passes.
- Stub dream run works from CLI.
- No source file exceeds 150 LOC.

## Slice 1 - Ingestion to Normalized Events

### Deliverables

- VS Code/Copilot adapter.
- Incremental checkpointing for session processing.
- Deterministic normalized event output.

### Tasks

- Parse known session/log formats.
- Add event normalization mapping.
- Add checkpoint storage and resume logic.
- Add malformed record diagnostics.
- Add integration fixture for sample session logs.

### Exit Checks

- Repeat run only processes new records.
- Same input yields stable event output.
- Dream diary shows ingestion counters.

## Slice 2 - Memory Consolidation

### Deliverables

- Initial memory backend.
- Dedupe and stale-prune policies.
- Provenance and confidence fields.

### Tasks

- Define memory record schema.
- Implement merge policy for duplicates.
- Implement stale-prune policy.
- Implement contradiction marker path.
- Add consolidation summary reporting.

### Exit Checks

- Dream run adds, updates, and prunes memory.
- Contradictions are surfaced, not overwritten.
- Provenance fields are always present.

---

> **DEFERRED — Slice: Documentation Reconstruction**
>
> This slice has been moved out of the active backlog. Documentation generation is a separate deferred use case. See the [Deferred Use Case: Documentation Generation](prd.md#deferred-use-case-documentation-generation) section in the PRD.

---

## Slice 3 - Skill Maintenance Proposals

### Deliverables

- Detection rules for failing workflows.
- Risk-labeled patch proposals.
- Approval gate for high-risk proposals.

### Tasks

- Define detection heuristics.
- Implement proposal artifact schema.
- Implement risk classification.
- Implement approval-required routing.

### Exit Checks

- Proposal artifacts are reviewable and valid.
- High-risk proposals never auto-apply.
- Diary includes proposal and risk summary.

## Slice 4 - Multi-Plugin Expansion

### Deliverables

- One additional adapter.
- One additional memory backend.
- Keep Copilot SDK as the only intelligence provider.

### Tasks

- Reuse contracts to add each plugin type.
- Add compatibility matrix tests.
- Add config-only plugin switching checks.

### Exit Checks

- Core code unchanged for plugin expansion.
- Contract suite passes for all plugin implementations.

## Slice 5 - Scheduling, Observability, Governance

### Deliverables

- Manual and scheduled run modes.
- Dream diary and metrics export.
- Workspace read-only enforcement and write isolation guards.
- Explicit tool contract enforcement for all state mutations.
- Separate-branch staging for all workspace-scoped outputs.

### Tasks

- Add scheduler integration and config.
- Add metrics collection and export format.
- Add transcript inert-data enforcement checks.
- Implement `record_memory` and `propose_skill_patch` as the only mutation contracts; block any direct filesystem writes outside these contracts.
- Add branch-staging guard for repo-scoped outputs.
- Add approval-gate enforcement: no run may resolve its own approval.

### Exit Checks

- Scheduled run works at configured interval.
- Required diary fields are always present.
- Direct workspace writes are blocked and produce an auditable error.
- Scoped outputs land on a separate branch, not the working branch.
- Approval gate cannot be bypassed by a dream run.

## Definition of Done

- Tests written first and passing.
- End-to-end demo scenario documented.
- Observability added for new behavior.
- Files remain below 150 LOC target.
- Public contracts documented.
- Legacy paths removed when they block clarity or velocity.

## Working Agreement

- Any file crossing 150 LOC is split before merge.
- Any behavior change without a failing test is rejected.
- Any new feature not wired end-to-end is deferred.
