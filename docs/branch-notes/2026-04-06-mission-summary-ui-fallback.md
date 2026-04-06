# 2026-04-06 – Mission Summary UI Fallback

## Summary
- Investigated dashboard mission summary rendering and verified the UI depended only on `/api/pipeline/dashboard` prompt rows for `mission_summary` text.
- Confirmed that when pipeline prompt rows are unavailable, the page stayed on the placeholder state even though `/api/dashboard` already contained a completed mission summary from ingestion.
- Added a frontend fallback so mission summary rendering uses `DashboardData.missionSummary` and `generatedAt` whenever no pipeline `mission_summary` prompt entry is present.
- Added regression tests for both fallback and prompt-precedence behavior.

## What Changed
- Updated `buildDashboardViewModel` to construct mission summary view data from `pipeline` when available, and otherwise from `dashboard` cache content.
- Added `dashboardViewModel` unit tests to verify fallback behavior and that pipeline prompt output still has priority when present.
- Added an unreleased changelog line documenting this fix and intent.

## What Did Not Work
- Keeping mission summary rendering exclusively tied to `pipeline.prompts` caused the mission overview panel to remain in "Building mission overview..." when the mission summary only existed in `/api/dashboard`.

## Validation
- Ran repository lint and test scripts from the workspace root.
