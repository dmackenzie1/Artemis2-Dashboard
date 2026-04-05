# 2026-04-05 - reduce hourly stats polling cadence

## Summary
- Reduced dashboard hourly channel stats polling cadence from every 10 seconds to every 5 minutes.
- Preserved the immediate on-mount fetch so operators still see activity data as soon as the dashboard loads.
- Added an unreleased changelog entry documenting the polling change and operational intent.

## What Did Not Work
- No failed implementation attempts in this change.
