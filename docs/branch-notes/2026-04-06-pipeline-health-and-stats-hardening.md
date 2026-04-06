# 2026-04-06 – Pipeline Health and Stats Hardening

## Summary
- Replaced LLM connectivity polling from model-generation prompts to a transport-level HTTP OPTIONS probe.
- Added stale `running` prompt execution recovery at pipeline start so orphaned rows are converted to `failed` with a recovery error message.
- Switched transcript word-total SQL queries from regex text splitting to the persisted `word_count` column.
- Updated `POST /api/pipeline/run` to acknowledge with HTTP 202 and start the pipeline in the background.
- Removed duplicate dashboard health polling from the page controller so only the top-level app health poll remains.

## What Changed
- Updated `docker/server/src/services/llmClient.ts` connectivity behavior to use `fetch(..., { method: "OPTIONS" })` with auth headers.
- Added stale prompt execution cleanup and run-state accessor in `docker/server/src/services/pipelineService.ts`.
- Updated mission/stats word aggregate SQL to use `sum(word_count)` in:
  - `docker/server/src/services/pipelineService.ts`
  - `docker/server/src/services/statsService.ts`
- Changed `docker/server/src/routes/pipeline.ts` `/run` route to fire-and-forget background execution and return an accepted/already-running payload.
- Removed `fetchHealth` from `docker/client/src/pages/dashboard/useDashboardController.ts` polling `Promise.all` and removed unused controller health state.
- Added connectivity probe regression coverage in `docker/server/src/services/llmClient.test.ts`.
- Added an unreleased changelog entry with intent.

## What Did Not Work
- Keeping `/api/pipeline/run` synchronous still risked reverse-proxy timeout behavior during long runs.
- Continuing regex word counting (`regexp_split_to_array`) remained unnecessarily expensive after `word_count` was already available.

## Validation
- Ran workspace lint and test suites from the repository root.
