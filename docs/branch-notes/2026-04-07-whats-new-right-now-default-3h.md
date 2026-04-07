# 2026-04-07 — What's New Right Now default 3-hour window

## What changed
- Updated the Overview `RecentWindowPanel` state initialization so the active rolling window defaults to `3h` instead of `24h`.
- Added an Unreleased changelog entry documenting the default-window behavior change.

## Why
- Operators asked for the "What's New Right Now" panel to open focused on the most recent data by default.
- Starting at `3h` reduces time-to-signal for near-now transcript review without requiring a manual toggle on every page load.

## What Did Not Work
- No failed implementation attempts were needed for this change.

## Follow-up
- If operators request persistence later, consider storing the selected window in local storage so user preference survives refreshes.
