# 2026-04-09 - Date lifecycle live events

## Summary
- Added new server/client live-update event types for date lifecycle progression: `day.ingested`, `day.llm.loaded`, `day.notable-queries.updated`, and `date.updated`.
- Added a shared backend helper to publish per-day lifecycle events during startup ingestion and manual/auto ingestion refresh runs.
- Updated app-level and page-level client listeners so dashboard/notable consumers refresh when date lifecycle events arrive.
- Added server-side live-update publish logging so every emitted event is visible in backend logs with type, timestamp, and payload.

## Validation
- `npm run lint`
- `npm run test`

## What Did Not Work
- Initial ripgrep discovery looked for a dedicated `liveUpdates` route module, but this repository serves SSE directly from `docker/server/src/index.ts`; no standalone route file exists.
