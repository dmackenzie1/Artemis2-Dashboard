# 2026-04-07 - add server-pushed live refresh events for dashboard + LLM health

## Summary
- Added a backend SSE endpoint at `GET /api/events` that keeps a streaming connection open and publishes typed runtime events for dashboard/stats/time-window invalidation plus pipeline + LLM connectivity status transitions.
- Added a new server `liveUpdateBus` service used by ingestion flows, scheduled/manual pipeline runs, and LLM connectivity polling to publish invalidation/status events.
- Wired the client to consume `/api/events` via `EventSource` through a shared `utils/live/liveEvents.ts` helper.
- Updated `DashboardPage` to convert incoming server events into `refreshToken` updates so panel ownership remains local while refresh behavior becomes event-driven.
- Updated `App.tsx` to react to `llm.connectivity.changed` events and refresh topbar health immediately, while slowing fallback health polling cadence.
- Shifted panel polling intervals to 30 minutes as a resilience fallback now that server-pushed invalidation handles near-real-time refresh behavior.
- Updated architecture docs for both client and server to describe the new live event channel and ownership boundaries.

## What Did Not Work
- Initial implementation chained `.catch(...).then(...)` around `runPipelineCycle()` in the manual pipeline route, which would incorrectly emit a completion event even after failures. I replaced it with `then(...).catch(...)` so success/failure events are mutually exclusive.
