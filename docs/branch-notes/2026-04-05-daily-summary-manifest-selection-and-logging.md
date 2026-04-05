# 2026-04-05 - Daily summary manifest selection and logging

## Summary
- Updated `PipelineService` daily grouping so `_summary` source documents are preferred over `_summary_partial` variants when both exist for the same canonical day file, preventing duplicate day-level source entries in `daily_summary` prompt submissions.
- Added structured server logs for daily summary grouping and execution to expose selected document paths, grouped day counts, and per-day chunk counts during layered generation.
- Added backend unit tests for daily-group selection behavior to guard against regressions in partial-vs-full day file handling.

## What Did Not Work
- Initially considered preserving both full and partial daily files and relying on synthesis deduplication, but this still inflates prompt context and causes contradictory source manifests; canonical per-day document selection was required earlier in the pipeline.

## Validation Notes
- Ran workspace lint and test commands after implementing grouping, logging, and test updates.
