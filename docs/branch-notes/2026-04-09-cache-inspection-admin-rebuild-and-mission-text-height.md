# 2026-04-09 – Cache inspection, admin rebuild path, and mission text workspace height

## Summary
- Switched the admin refresh control from pipeline-only execution to full ingest (`POST /api/ingest`) so transcript DB + analysis cache + prompt pipeline all rebuild in one action.
- Added API cache-control hardening (`Cache-Control: no-store`) at `/api/*` to prevent browser HTTP caching from masking freshly rebuilt payloads.
- Added explicit cache diagnostics and clear endpoints:
  - `GET /api/cache/inspect`
  - `POST /api/cache/clear`
- Added cache inspection helpers in in-memory cache services for stats and rolling window summary.
- Added automatic stats/time-window cache invalidation + prewarm after filesystem-triggered auto-ingestion (parity with manual ingest).
- Ensured the Mission Text Workspace always fills the full left column height between top header and bottom histogram by making the dashboard pane and panel stretch to 100% height.

## What Did Not Work
- First considered changing only frontend fetch options (`cache: "no-store"`) on selected calls, but this would still leave other API consumers vulnerable to stale intermediary/browser behavior; moved to uniform server-side `no-store` headers for all `/api/*` responses.
