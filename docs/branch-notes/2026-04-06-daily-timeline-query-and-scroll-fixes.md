# 2026-04-06 – Daily/Timeline Query and Scroll Fixes

## Summary
- Investigated operator report that daily/timeline outputs were not useful and mission summary text was appearing truncated.
- Updated dashboard view-model wiring so the **Last 24 Hours** panel now reads from the `recent_changes` prompt output (with `/api/dashboard` fallback) instead of `daily_summary`.
- Updated Mission Summary and Last 24 Hours panel rendering to keep full structured output in a single scrollable content container instead of splitting/truncating lines.
- Tuned mission/recent prompt instructions to request longer plain-text outputs and avoid markdown emphasis artifacts that were surfacing as noisy `*` characters in the UI.
- Adjusted starter mission queries to better match daily/timeline operator intents.

## What Changed
- `buildDashboardViewModel` now maps Last 24 Hours to `recent_changes`, with a fallback to `DashboardData.recentChanges`.
- `MissionOverviewPanel` now renders the complete summary in one scrollable div using structured text rendering.
- `DailySummaryPanel` now renders the complete summary in one scrollable div instead of slicing to five rows.
- Added `summary-scroll-copy` styling to support scroll behavior inside both summary panes.
- Expanded prompt guidance for `mission_summary.txt` and `recent_changes.txt` to enforce substantial plain-text outputs.
- Updated dashboard starter queries for daily/timeline-oriented phrasing.

## What Did Not Work
- Keeping the old lead-plus-bullets split in Mission Summary and the five-line truncation in Last 24 Hours continued to hide critical analysis detail and did not resolve the operator’s readability issue.

## Validation
- Ran repository lint and tests from the workspace root.
