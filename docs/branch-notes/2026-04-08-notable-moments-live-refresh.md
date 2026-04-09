# 2026-04-08 - Notable moments live refresh and regeneration visibility

## Summary
- Confirmed the Notable Moments page only fetched `/api/pipeline/notable-moments` once on initial mount, which made newly generated prompt output appear stale until a manual browser reload.
- Added event-driven and interval-driven refresh behavior to `NotableMomentsPage` so the page reloads data when `pipeline.run.completed` or `dashboard.cache.updated` events arrive, and also performs a 60-second fallback refresh.
- Updated the notable moments API helper to use `fetch(..., { cache: "no-store" })` so browser-level caching does not mask newly generated payloads.

## What Did Not Work
- Relying on one-time mount fetch alone did not reflect new notable moments after ingestion/pipeline activity unless users manually refreshed the page.

## Validation
- Ran repo lint and tests after the change.
