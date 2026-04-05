# 2026-04-05 - harden dashboard polling cadence

## Summary
- Increased topbar health polling from every 10 seconds to every 5 minutes.
- Increased dashboard aggregate data polling from every 10 seconds to every 5 minutes.
- Kept immediate on-mount fetch behavior so operators still get current state on first load.
- Added an unreleased changelog entry with intent for maintainers.

## What Did Not Work
- No failed implementation attempts in this change.
