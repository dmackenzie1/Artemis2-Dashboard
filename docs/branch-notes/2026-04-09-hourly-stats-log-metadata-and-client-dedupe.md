# 2026-04-09 — Hourly stats log metadata and client dedupe

## Summary
- Added richer server log metadata for `/api/stats/channels/hourly` requests, including request id, endpoint, requested/completed timestamps, requested vs normalized day window, cache key/state, and row counts.
- Added `StatsService.inspectHourlyRequest()` diagnostics helper so route logs can report cache behavior (`miss`, `fresh`, `stale`) before execution.
- Added client-side in-memory dedupe for hourly stats requests in `fetchStatsHourlyByChannel(days)`:
  - coalesces concurrent same-`days` requests into a single in-flight promise,
  - caches successful responses for 60 seconds to reduce repeated pulls.
- Added a unit test to verify in-flight request deduplication for hourly stats API calls.
- Updated `CHANGELOG.md` with an Unreleased entry and explicit intent.

## Validation
- Ran repository lint and test commands from the repo root.

## What Did Not Work
- Initially considered removing all hourly-query logs from `StatsService`, but that would have reduced visibility into actual DB query execution versus cache-level request handling. Kept service execution logs and instead made route-level logs explicit/structured so duplicate-looking lines now communicate different stages.
