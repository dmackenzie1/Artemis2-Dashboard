# 2026-04-07 - Independent dashboard widget loading

## Summary
- Decoupled Overview dashboard data fetching so dashboard cache, pipeline dashboard, and stats summary requests resolve independently.
- Updated metrics view-model behavior so the Transcript Metrics panel remains in loading state until stats summary data actually arrives.
- Added regression tests for the stats loading/ready transitions in `buildDashboardViewModel`.

## What Did Not Work
- Initial attempt to rely only on `Promise.allSettled` around the three requests did not by itself improve perceived responsiveness, because the old model still grouped state updates behind one aggregated success path.
