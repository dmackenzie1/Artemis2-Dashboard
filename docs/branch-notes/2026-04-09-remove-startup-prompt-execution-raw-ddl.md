# 2026-04-09 – Remove Startup Prompt Execution Raw DDL

## Summary
- Addressed backend startup schema-drift handling that executed raw `ALTER TABLE` statements against `prompt_executions`.
- Removed boot-time raw DDL/backfill logic under the assumption that required columns already exist in deployed databases.

## What Changed
- Updated `docker/server/src/index.ts` to remove the `ensurePromptExecutionSubmittedTextColumn` helper and stop invoking it during startup.
- Left existing startup schema/index handling in place (`updateSchema()` and transcript search indexes).
- Added an unreleased changelog entry documenting the refactor and intent.

## What Did Not Work
- Retaining the raw `ALTER TABLE ... add column if not exists` boot path remains a maintenance risk because it duplicates migration concerns in runtime startup code and obscures schema ownership.

## Validation
- Ran repository lint and test scripts from the workspace root.
