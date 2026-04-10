# 2026-04-10 - Time-window summary parameter binding fix

## Summary
- Investigated repeated `/api/time-window-summary` failures logging Postgres error `there is no parameter $1`.
- Found the rolling-window transcript SQL in `TimeWindowSummaryService` was using `$1/$2` placeholders while executing through MikroORM/Knex `execute(...)`, which expects `?` bindings in this path.
- Updated the query placeholders to `?` so the provided `[windowStart, windowEnd]` values bind correctly.
- Added an Unreleased changelog entry documenting the binding fix and intent.

## What Did Not Work
- Keeping `$1/$2` placeholders with `execute(..., [params])` continued to produce the same server-side Postgres error because the bindings were not applied through this execution path.

## Validation
- Ran lint and test suites from the repository root after the change.
