# 2026-04-05 - disable hourly channel dashboard request

## Summary
- Removed the dashboard polling request to `/api/stats/channels/hourly` so the mission view no longer triggers hourly channel summary-style fetches during each refresh cycle.
- Removed the utterances timeline panel from the dashboard page, leaving mission overview, daily summary, stats, and chat as the primary operator surfaces.

## What Did Not Work
- No alternate implementation was attempted; the first pass (removing the hourly endpoint fetch from dashboard polling) addressed the issue directly.
