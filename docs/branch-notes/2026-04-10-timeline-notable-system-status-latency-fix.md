# 2026-04-10 - Timeline/Notable/System Status latency fix

## Summary
- Reworked `/api/pipeline/notable-moments` to read only the latest `notable_moments` prompt execution instead of hydrating the full prompt dashboard payload.
- Added `PipelineService.getPromptDashboardEntryByKey()` to support key-scoped prompt status/output retrieval.
- Reworked `PipelineService.getPromptMatrixState()` to query prompt execution rows with a targeted SQL projection (`prompt_executions` + `prompt_definitions` join) instead of ORM-populating full prompt execution entities.
- Updated the prompt matrix unit test to match the new SQL-backed execution read path.
- Added an unreleased changelog entry documenting intent and operator impact.

## What Did Not Work
- Running `npm run test` at the workspace root still fails due to an unrelated pre-existing backend test in `src/services/transcriptCandidateService.test.ts` (`expected params[1] to be "FD"`), which is outside this latency fix scope.
