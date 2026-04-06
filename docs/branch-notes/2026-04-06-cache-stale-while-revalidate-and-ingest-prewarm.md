# 2026-04-06 - Cache stale-while-revalidate and ingest prewarm

## Summary
- Implemented stale-while-revalidate behavior for server-side expiring caches so stale values can be returned immediately while refresh happens in the background.
- Updated transcript stats caching to use a short fresh TTL and longer stale window, including background refresh de-duplication.
- Updated rolling time-window summary caching to return stale summaries immediately and revalidate asynchronously.
- Updated Redis-backed LLM caching to store cache envelopes (fresh/stale windows) and support stale response serving with queued background refresh.
- Wired post-ingest cache invalidation for DB stats + rolling summary cache and added eager stats cache prewarming for summary/day totals.
- Added a regression test covering stale LLM cache behavior.

## What Did Not Work
- Running `npm run -s lint` from the repo root still fails with an existing TypeScript environment/dependency-resolution issue for `redis` module typing (`Cannot find module 'redis'`) in this environment.
