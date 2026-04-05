# 2026-04-05 - stats api and server observability

## Summary
- Added DB-backed stats APIs for mission summary totals, daily aggregates, and utterances per hour per channel.
- Updated dashboard stats panel data flow to pull from the new `/api/stats/*` endpoints.
- Added startup and ingestion/prompt observability logs for DB mode, DB connectivity, prompt send/receive lifecycle, and transcript insertion counts.
- Stopped logging full prompt submission payloads in server logs and now persist submission payloads to filesystem for audit/debug.

## What Did Not Work
- Attempted an initial direct `statsService` dependency in `createApiRouter`; this failed because the router is created before DB initialization in `index.ts`. Switched to a lazy getter callback (`getStatsService`) to resolve startup ordering cleanly.
