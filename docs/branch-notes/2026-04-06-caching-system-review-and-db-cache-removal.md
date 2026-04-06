# 2026-04-06 — Caching system review, broader short-TTL caching, and DB cache removal

## Summary
- Reviewed the existing cache architecture and identified two active cache layers:
  - Redis-backed LLM response cache in `LlmClient` (kept).
  - Legacy PromptExecution database cache lookup in `PipelineService` (removed).
- Removed the old PromptExecution DB cache read path so prompt executions are no longer short-circuited by prior DB rows.
- Added a reusable in-memory `ExpiringCache` utility for short-lived read caching.
- Applied short-lived caching to stable/read-heavy paths:
  - `StatsService` summary/day/hourly queries: 5-minute TTL.
  - `TimeWindowSummaryService` per-window output: 3-minute TTL.
  - `PipelineService` mission stats view cache: increased from 30 seconds to 5 minutes.
- Kept `cache_hit` metadata behavior in place for dashboard compatibility, but it now remains `false` because DB replay caching has been removed.

## What Did Not Work
- `npm run lint` currently fails in this environment due backend TypeScript not resolving the `redis` module types (`TS2307` in `src/services/redisLlmCache.ts`) plus an implicit `any` warning in that same file. This appears pre-existing and unrelated to the cache refactor in this branch.
