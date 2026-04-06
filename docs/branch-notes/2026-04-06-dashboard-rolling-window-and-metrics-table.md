# 2026-04-06 — Dashboard rolling window focus + metrics table

## Summary
- Reordered the Overview page so the database-backed rolling recent-transcript window panel is now top-left and Mission Review Summary moved to the middle row.
- Replaced the old latest-day/file-driven panel behavior with a rolling time-window query panel that requests `/api/time-window-summary` and supports 3h/6h/12h/24h quick-select controls (24h default).
- Updated rolling-window synthesis guidance to emphasize what is new/current in the selected window.
- Updated Transcript Metrics to include a per-day table showing day, utterance count, and word count.

## What Did Not Work
- Attempted to use the required `browser_container` screenshot workflow for the UI diff, but this environment/session did not expose that tool, so no new screenshot artifact could be captured from it.
