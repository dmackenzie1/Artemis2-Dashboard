# 2026-04-09 - DB-backed daily transcript volume API

## Summary
- Added a new stats API endpoint: `GET /api/stats/daily-volume?days=<n>` that reads directly from transcript DB aggregates and returns daily utterance/word/channel totals.
- Updated Overview `StatsPanel` so the "Daily Transcript Volume" table is loaded from the new stats endpoint (default last 5 days), no longer from `/api/dashboard` cached day summaries.
- Improved the Daily Transcript Volume table UX with a clear last-N-days label, alternating row backgrounds, and a totals footer row.
- Added a client API helper and test coverage for the new endpoint.

## What Did Not Work
- Initial search through `/api/dashboard` data paths confirmed this table depended on analysis cache payload shape (`days[].stats`) that can lag LLM prompt completion; this path was intentionally not retained.

## Verification
- `npm run lint`
- `npm run test`
