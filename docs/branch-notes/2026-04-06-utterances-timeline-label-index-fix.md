# 2026-04-06 - Utterances timeline label-index fix

## Summary
- Fixed a frontend TypeScript build failure in `UtterancesTimelinePanel` by restoring `labelIndexes` derivation from `xAxisTicks`.
- Updated the bottom timeline axis loop to iterate over `hourlyTotals` instead of raw `histogram` entries so axis labels match rendered bars.
- Added a changelog entry under `## [Unreleased]` documenting the build fix and intent.

## What Did Not Work
- Re-running the full `docker compose up --build` pipeline was not necessary for initial diagnosis because the TypeScript error already pinpointed `labelIndexes` as undefined in the frontend build stage.
