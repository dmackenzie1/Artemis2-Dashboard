# 2026-04-09 — server-startup-modularization

## Summary
- Refactored `docker/server/src/index.ts` so it now focuses on high-level wiring only: service initialization, DB mode selection, runtime scheduling startup, and `app.listen(...)`.
- Extracted Express app/router and middleware composition into `docker/server/src/app.ts`.
- Extracted runtime startup migration scripts into `docker/server/src/migrations/runtimeMigrations.ts`.
- Extracted filesystem auto-ingestion and background scheduling flows into `docker/server/src/services/ingestionSchedulerService.ts`.

## What Changed
- Added `createServerApp`, `attachDatabaseRoutes`, `attachPipelineRoutes`, `attachDatabaseDisabledRoutes`, and `attachErrorHandler` helpers in `app.ts`.
- Added migration helpers for:
  - `ensurePromptExecutionSubmittedTextColumn`
  - `ensureTranscriptSearchIndexes`
  - `runRuntimeMigrations`
- Added `IngestionSchedulerService` to encapsulate:
  - startup ingestion flow
  - manual ingestion flow
  - filesystem watcher/debounce queueing
  - scheduled pipeline runs
  - ingestion event artifact logging and lifecycle event publishing

## What Did Not Work
- Initial attempt wrote `runtimeMigrations.ts` before creating the `src/migrations` directory, which failed with `No such file or directory`.
- Initial DB route split attempted to construct a `PipelineService` instance inline during route attachment, which complicated service ownership; this was corrected by splitting pipeline route attachment into a dedicated `attachPipelineRoutes` step after service initialization.

## Validation
- `npm run lint`
- `npm run test`
