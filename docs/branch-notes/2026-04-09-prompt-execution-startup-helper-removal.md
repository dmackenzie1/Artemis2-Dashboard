# 2026-04-09 - Prompt execution startup helper removal

## Summary
- Removed the `ensurePromptExecutionSubmittedTextColumn` startup helper from `docker/server/src/index.ts`.
- Removed the startup invocation of that helper during transcript DB initialization.
- Preserved normal startup flow with:
  - `await orm.getSchemaGenerator().updateSchema();`
  - `await ensureTranscriptSearchIndexes(orm);`

## What Did Not Work
- Attempted a single `apply_patch` operation spanning both helper removal and startup call removal, but context matching failed because the expected startup logger lines did not match the file exactly.
- Resolved by using a targeted scripted edit and then verifying the resulting file content.
