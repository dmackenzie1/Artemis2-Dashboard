# 2026-04-09 — System Status prompt matrix and live event fanout

## Summary
- Renamed the primary operator label from "System Logs" to "System Status" in the top navigation and page header while preserving the existing route path.
- Added prompt lifecycle live-update events (`prompt.sent`, `prompt.received`, `prompt.error`) to the shared event contract and published those events directly from pipeline execution lifecycle transitions.
- Added a server-side prompt matrix snapshot API (`GET /api/pipeline/prompt-matrix-state`) that returns day columns (bounded), prompt rows, and per-cell lifecycle state.
- Updated System Status to bootstrap matrix state from the API, render a day/prompt symbol matrix, and patch cells live from broadcast events.
- Consolidated page-level live update consumers onto app-level event broadcast fanout by introducing DOM-event subscription helper wiring for non-shell pages.
- Added admin-only actions on System Status (`?admin=true`) for clear cache and full regenerate flows.

## What Did Not Work
- First attempt considered deriving day columns from prompt debug artifact file names only, but this was not reliable for "already completed before client connect" state bootstrap; switched to a server-side DB-backed snapshot endpoint instead.
- First pass kept separate SSE subscriptions in each page, but that conflicted with the requirement to rely on high-level broadcast fanout to all components; switched pages to consume DOM broadcast events instead.

## Validation Notes
- Plan-level behavior now supports late client joins by loading matrix state from server snapshot before applying live deltas.
- Day columns are bounded to a maximum of 11 in the current implementation, while endpoint query validation allows up to 20.
