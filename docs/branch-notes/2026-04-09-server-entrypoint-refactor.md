# 2026-04-09 - Server Entrypoint Refactor

## Summary
- Extracted raw Express wiring and route registration from `docker/server/src/index.ts` into `docker/server/src/app.ts`.
- Moved runtime startup migration helpers into `docker/server/src/migrations/runtimeMigrations.ts`, including:
  - `ensurePromptExecutionSubmittedTextColumn`
  - `ensureTranscriptSearchIndexes`
- Extracted filesystem watcher, startup ingestion, manual refresh, and scheduled pipeline background logic into `docker/server/src/services/backgroundWorkersService.ts`.
- Reduced `docker/server/src/index.ts` to service initialization + dependency wiring + `app.listen()` startup.

## Validation
- Ran `npm run lint` from repository root.
- Ran `npm run test` from repository root.

## What Did Not Work
- Initial `npm run lint` failed because `createServerApp` used an inline connectivity status type that was missing `checkedAt`; fixed by using `LlmConnectivityStatus` directly.
