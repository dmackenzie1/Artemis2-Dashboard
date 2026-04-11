# 2026-04-11 — Parallel daily stages and dashboard clarity updates

## Summary
- Refactored day-scoped pipeline orchestration to execute `daily_summary_am` and `daily_summary_pm` runs in parallel across eligible days, await stage settlement, then execute `daily_summary` finals in parallel, await settlement, and only then continue into downstream global synthesis.
- Kept notable-moments generation day-scoped but moved it behind the daily-final barrier so daily summary context consumed by notable generation is derived from the settled final stage.
- Hardened Transcript Metrics panel scroll containment by constraining panel-body overflow and assigning explicit vertical scrolling to the stats groups wrapper.
- Increased Signal Chat header/kicker/subtitle contrast by switching to page-local styles instead of shared muted timeline typography tokens.
- Bumped root/client/server versions from `0.2.0` to `0.3.0` for dashboard-facing behavior changes.

## Validation
- `npm run lint`
- `npm run test`

## What Did Not Work
- Attempting to rely on existing `DashboardPanel` body overflow alone still allowed very tall stats tables to visually crowd lower content in constrained layouts; explicit nested overflow ownership on the stats groups wrapper was required.
