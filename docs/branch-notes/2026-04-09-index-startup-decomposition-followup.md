# 2026-04-09 — index-startup-decomposition-followup

## Summary
- Reduced `docker/server/src/index.ts` to entrypoint wiring only (startup runtime creation, signal shutdown hooks, and `app.listen`).
- Added `docker/server/src/server/createServerRuntime.ts` to own Express app assembly, DB initialization, migrations, service construction, and route registration.
- Split runtime migration helpers into a dedicated runtime migration folder: `docker/server/src/migrations/runtime/*`.
- Added `docker/server/src/services/backgroundWorkersService.ts` to isolate startup ingestion + recurring worker loops from index wiring.

## What Changed
- `createServerRuntime` now centralizes:
  - Redis cache initialization and fallback handling
  - LLM/analysis/system-logs service wiring
  - DB schema update + runtime migrations + route registration
  - cache-clear event fanout wiring
- `BackgroundWorkersService` now centralizes:
  - initial LLM connectivity probe state
  - recurring LLM connectivity polling + live event publication
  - startup ingestion kickoff + background worker activation via `IngestionSchedulerService`
- Runtime migrations now live in:
  - `migrations/runtime/ensurePromptExecutionSubmittedTextColumn.ts`
  - `migrations/runtime/ensureTranscriptSearchIndexes.ts`
  - `migrations/runtime/index.ts`

## What Did Not Work
- No failed implementation attempts in this follow-up refactor.

## Validation
- `npm run lint` (from `docker/server`)
- `npm run test` (from `docker/server`)
