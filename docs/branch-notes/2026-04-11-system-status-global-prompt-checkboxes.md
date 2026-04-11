# 2026-04-11 — System Status global prompt checkboxes and global marker day

## Summary
- Reworked System Status global checkbox support to avoid duplicate prompt definitions: 3h/6h/12h now map to existing `time_window_summary` executions, and Complete maps to existing `mission_summary` execution state.
- Added synthetic global rows in prompt-matrix state for mission-summary windows (3h/6h/12h/Complete) plus Timeline/Notable page readiness indicators.
- Updated prompt execution persistence so global/non-day executions are stored with `response_day = "*"` instead of `null`.
- Updated prompt matrix day-key derivation so the `*` global marker always renders as a dedicated matrix column and remains distinct from date-scoped columns.
- Added `time_window_summary` prompt-execution persistence in the rolling-window service so global 3h/6h/12h checkboxes are DB-backed and stay aligned with existing dashboard data flow.

## What Did Not Work
- The first pass added separate new global prompt files (`mission_summary_3h/6h/12h/...`) which duplicated existing 3h/6h/12h DB-backed logic. That approach was replaced with synthetic matrix rows backed by existing `time_window_summary` and `mission_summary` execution data.
