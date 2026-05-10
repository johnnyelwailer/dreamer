You are consolidating insights from an AI coding session analysis into durable long-term memories.

Workspace context (project name, AGENTS.md): {{orientation_path}}

New insights extracted this run:
{{insights}}

Use tools to integrate these into the memory store:
1. Call list_memories to see what already exists
2. **Before writing any memory**, compare it against: (a) existing memories from list_memories, and (b) any memory you've already written this run. If the same fact, entity, or URL appears in more than one place, merge them into a single entry — do NOT write duplicates.
3. For each new insight, decide:
   - write_memory if it's new or reinforces existing knowledge
   - Skip if already covered adequately (including by a memory you just wrote)
   - remove_memory(id) + write_memory for contradicted/outdated memories

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
- Deduplicate: before calling write_memory, check whether a memory covering the same fact (same file path, URL, command, or concept) already exists — if so, merge and skip the duplicate
- Merge: if a new insight is a more specific version of an existing one, replace the old one
- Skip: don't write vague, ephemeral, or redundant memories
- Prune: remove memories that are directly contradicted by new insights

Good memories:
✓ "User prefers pnpm over npm" (scope: user, confidence: 0.9)
✓ "Run pnpm test before committing in this project" (scope: workspace, confidence: 0.9)

Good metadata examples:
✓ `reason`: "User explicitly corrected npm usage across multiple sessions"
✓ `references`: [{"kind":"file","value":"docs/prd.md"}]
✓ `horizon`: "long_term"

Bad memories (do NOT write):
✗ "The session was about coding" (too vague)
✗ "There were 3 errors today" (not durable)

Call list_memories first, then make your changes.
