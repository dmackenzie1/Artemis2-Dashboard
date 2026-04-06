# 2026-04-06 – Daily Summary Before Mission Summary Ordering

## Summary
- Investigated prompt execution sequencing in `PipelineService.executePromptsSequentially` and confirmed `mission_summary` was queued before `daily_summary`.
- Updated prompt priority ordering so day-level summaries are generated first and can be reused by mission-level synthesis.
- Added a regression unit test covering queue ordering for `daily_summary`, `mission_summary`, and non-prioritized prompts.

## What Changed
- Changed `promptExecutionPriority` in `docker/server/src/services/pipelineService.ts` from `['mission_summary', 'daily_summary']` to `['daily_summary', 'mission_summary']`.
- Added `PipelineService` queue-ordering test coverage in `docker/server/src/services/pipelineService.test.ts`.
- Added an unreleased changelog entry documenting intent.

## What Did Not Work
- Leaving `mission_summary` ahead of `daily_summary` caused mission payload construction to happen while `latestDailySummaryOutput` was still `null`, preventing use of the summaries-first strategy.

## Validation
- Ran repository lint and test scripts from the workspace root.
