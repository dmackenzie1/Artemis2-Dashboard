# 2026-04-06 — notable moments page and pipeline

## Summary
- Added a new `notable_moments` prompt template and wired it into the DB-backed prompt pipeline.
- Added backend endpoint `GET /api/pipeline/notable-moments` to expose latest generated notable moments payload.
- Added frontend `/notable` route with a new Notable Moments page and navigation tab.

## What Did Not Work
- Attempted to reuse generic pipeline dashboard payload directly in the page, but this made day-level parsing brittle due to mixed prompt output formats.
- Added a dedicated notable moments API route to keep the page contract focused and stable.
