Post-consolidation global extraction pass.

Review current memories and identify only globally generalizable user-scope rules.
Do not call write_global_memory/remove_memory/finalize_consolidation in this specialist pass.
Use list_memories and read_reference as needed and return only compact recommendations.
