# 2026-04-10 — System Status prompt matrix orphaned execution guard

## Summary
- Investigated a System Status page failure where `/api/pipeline/prompt-matrix-state` returned HTTP 500 and the client logged `System status prompt matrix failed to load`.
- Added a defensive guard in `PipelineService.getPromptMatrixState` so execution rows without a resolvable prompt key are skipped instead of crashing matrix hydration.
- Added a unit test that simulates an execution row with a missing prompt relation and verifies matrix rendering still returns prompt rows/cells.
- Updated `CHANGELOG.md` under `## [Unreleased]` with intent-driven rationale.

## What Did Not Work
- I did not reproduce the exact failing production dataset locally, so the fix was validated via a targeted unit test that models the suspected orphaned relation shape.

## Validation
- Ran backend lint (`tsc --noEmit`) and backend tests (`vitest run src`).
