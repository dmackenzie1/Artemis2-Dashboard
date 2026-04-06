# 2026-04-06 — Mission hourly stats y-axis label fix

## Summary
- Updated Mission Hourly Stats y-axis tick rendering to use stable per-position keys instead of raw numeric values.
- Switched y-axis tick labels to rounded integer values with locale formatting so the axis reads cleanly under live histogram updates.
- Preserved descending y-axis tick order (max at top, 0 baseline at bottom) while removing duplicate-key reconciliation artifacts.

## What Did Not Work
- Keeping numeric values as React keys caused duplicate-key behavior when values repeated (especially during empty/loading transitions), which left stale `0` labels stacked at the top of the axis.

## Validation
- `npm run lint`
- `npm run test`
