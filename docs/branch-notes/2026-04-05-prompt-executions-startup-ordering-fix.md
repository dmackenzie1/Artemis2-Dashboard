# 2026-04-05 – Prompt Executions Startup Ordering Fix

## Summary
- Investigated backend startup failure when Postgres is initialized from scratch and transcript database mode is enabled.
- Identified that startup SQL attempted to alter `prompt_executions` before MikroORM created the table.
- Reordered startup schema operations so `updateSchema()` runs before the `submitted_text` backfill/constraint SQL.

## What Changed
- Updated `docker/server/src/index.ts` to run `orm.getSchemaGenerator().updateSchema()` before `ensurePromptExecutionSubmittedTextColumn(orm)`.
- Added an unreleased changelog entry documenting the startup-ordering fix and intent.

## What Did Not Work
- Keeping the backfill helper ahead of schema synchronization failed on fresh databases with error `relation "prompt_executions" does not exist` (Postgres code `42P01`).

## Validation
- Ran repository lint and test scripts from the workspace root.
