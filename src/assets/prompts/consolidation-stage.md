You are consolidating insights from an AI coding session analysis into durable long-term memories.

Workspace context (project name, AGENTS.md): {{orientation_path}}

New insights extracted this run:
{{insights}}

Use tools to integrate these into the memory store:
1. Call list_memories to see what already exists
2. Review the full memory store, not just new insights. Perform a hygiene pass across every existing memory:
   - validate stale or suspicious memories against their references with read_reference
   - merge duplicates and near-duplicates
   - generalize memories that are too specific but represent a reusable rule
   - localize memories that are only true for one feature/session/file by adding applies_when, tags, evidence, and references
   - remove memories that are unsupported, contradicted, obsolete, or too narrow to be useful
3. **Before writing any memory**, compare it against: (a) all existing memories from list_memories, and (b) any memory you've already written this run. If the same fact, entity, URL, file, or convention appears in more than one place, merge them into a single entry — do NOT write duplicates.
4. For each new insight and each existing memory, decide:
   - write_memory if it's new or reinforces existing knowledge
   - Skip if already covered adequately (including by a memory you just wrote)
   - remove_memory(id) + write_memory for contradicted/outdated memories
   - remove_memory(id) + write_memory for memories that need generalization or stricter local metadata

If specialist agents are available, delegate:
- contradiction/scope classification to `contradiction-scope-reviewer`
- final memory writes/removals to `memory-editor`

Only the memory editor should call write_memory or remove_memory.

Required fields for every `write_memory` call:
- `reason`: why this qualifies as durable memory
- `horizon`: `short_term` or `long_term`
- `references`: at least one concrete reference object (`file`, `url`, `session`, or `doc`)
- If `horizon=short_term`, include `expires_at`

Strongly recommended fields:
- `category`, `tags`, `rationale`, `applies_when`, `evidence`

Consolidation rules:
- Scope: use "user" for personal preferences/habits, "workspace" for project-specific facts
- Confidence: 0.9 for clear explicit corrections, 0.85 for observed patterns, 0.75 for inferred preferences
- Source validation: use read_reference before pruning, contradicting, or materially rewriting a memory with references. If references are missing or unreadable, lower confidence or add precise run/session references rather than inventing certainty.
- Deduplicate: before calling write_memory, check whether a memory covering the same fact (same file path, URL, command, or concept) already exists — if so, merge and skip the duplicate
- Merge/generalize: if several narrow memories point to the same stable rule, replace them with one broader memory that keeps the important applies_when boundaries and references
- Localize: if an insight is super-specific, either skip it or write it with tight applies_when, tags, evidence, and references so future agents do not overapply it
- Skip: don't write vague, ephemeral, or redundant memories
- Prune: remove memories that are directly contradicted by new insights
- Prune unsupported memories: remove memories that have no useful references/evidence and cannot be validated from source material

Good memories:
✓ "User prefers pnpm over npm" (scope: user, confidence: 0.9)
✓ "Run pnpm test before committing in this project" (scope: workspace, confidence: 0.9)
✓ "User prefers state-transition examples when discussing product behavior" (scope: user, category: communication, confidence: 0.9)
✓ "User wants critical technical pushback on weak plans instead of automatic agreement" (scope: user, category: communication, confidence: 0.9)
✓ "When editing the checkout acceptance workflow, preserve the IN_PROGRESS → ACCEPTED state-transition convention" (scope: workspace, applies_when: "Only checkout acceptance workflow edits", references/evidence required)

Good metadata examples:
✓ `reason`: "User explicitly corrected npm usage across multiple sessions"
✓ `references`: [{"kind":"file","value":"docs/prd.md"}]
✓ `horizon`: "long_term"

Bad memories (do NOT write):
✗ "The session was about coding" (too vague)
✗ "There were 3 errors today" (not durable)
✗ "User likes examples" (too vague)
✗ "Always ask questions before doing anything" (overbroad; normalize to when clarification is needed)
✗ "Button X changes A.y to ACCEPTED" (too local unless tied to a specific feature/file with applies_when and evidence)

Call list_memories first, then make your changes.
