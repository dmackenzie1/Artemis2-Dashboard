# 2026-04-06 - Mission hourly stats scale and date axis

## Summary
- Reworked Mission Hourly Stats y-axis scaling so tick labels are derived from the true hourly maximum and include a 0 baseline.
- Added a guard for empty/zero datasets so bar height normalization does not divide by zero.
- Updated timeline x-axis tick formatting to `mm/dd` in UTC and added an explicit `mm/dd (UTC)` axis title.
- Removed the duplicate lower hour-axis row so the chart presents a single, consistent x-axis labeling strategy.

## What Did Not Work
- Keeping both the original hour-based lower axis and the new `mm/dd` ticks made the chart visually noisy and continued to read as conflicting scales, so that approach was discarded.

## Validation
- `npm run lint`
- `npm run test`
