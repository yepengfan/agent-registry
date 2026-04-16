---
name: has-migration-safety
description: Database migrations are safe for zero-downtime deployment
gate: true
metric: migration_safety
pass_when: "no destructive operations without multi-step plan, no locks on large tables"
---

## Has Migration Safety

Database migrations must be safe for zero-downtime deployment.

### Unsafe Patterns
- `DROP TABLE` or `DROP COLUMN` without a multi-step migration plan
- Adding `NOT NULL` column without a default value
- Renaming columns or tables (breaks running code during deploy)
- Long-running locks on large tables (adding indexes without `CONCURRENTLY`)
- Data migrations mixed with schema migrations in a single file

### Safe Patterns
- Adding nullable columns
- Adding indexes with `CONCURRENTLY` (PostgreSQL) or equivalent
- Multi-step migrations: add column -> backfill -> add constraint
- Separate data migration files from schema migration files

### Pass
All migrations follow safe patterns, or no migration files are present.

### Fail
One or more unsafe migration patterns detected. Report each with file, line, and recommended safe alternative.

### Output Contract

Include in `criteria_results`:
```json
{"criterion": "has-migration-safety", "gate": true, "pass": <bool>, "metric": "migration_safety", "value": "<safe|unsafe>", "detail": "<summary>"}
```
