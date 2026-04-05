# 2026-04-05 - pipeline after ingestion ordering

## Summary
- Delayed automatic pipeline scheduling until after startup ingestion completes.
- Removed the pre-listen `PIPELINE_AUTO_RUN` immediate pipeline execution path that fired before CSV ingestion.
- Added a guarded scheduler bootstrap helper so the interval is started once after the initial startup prompt workflow succeeds.

## What Did Not Work
- Running the initial `runPipelineCycle()` during service initialization caused prompt executions to start before startup ingestion finished, which produced prompt runs with only placeholder source files.

## Validation
- Ran `npm run lint`.
- Ran `npm run test`.
