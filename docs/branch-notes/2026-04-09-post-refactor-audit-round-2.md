# Branch Notes — 2026-04-09: Post-Refactor Audit Round 2

## Context

Second pass of fixes from the verification-confirmed issues list. All 11 reported issues are now
addressed (10 code fixes + 1 documented for future work). Continues from
`2026-04-09-post-refactor-safe-fixes.md`.

## What Was Fixed

### C1 — buildSourceContextFromTranscriptDatabase full table scan
**File:** `docker/server/src/services/pipelineService.ts`

Added an optional `dayKeys?: Set<string>` parameter. When non-empty, an `$and` date-range filter
is applied to the `em.find(TranscriptUtterance)` call, scoping the query to only the rows whose
`timestamp` falls within the min–max day boundary of the changed keys. The `executePromptsSequentially`
call site now passes `changedDayKeys` through so incremental pipeline runs avoid the full scan.
Full-load behaviour is preserved when `dayKeys` is empty or absent (first run, manual ingest, etc.).

### C2 — RequestContext middleware registered after /api router (Option A chosen)
**Files:** `docker/server/src/app.ts`, `docker/server/src/server/createServerRuntime.ts`

Added an optional `orm?: MikroORM` field to `ServerAppOptions`. When provided, `createServerApp`
registers `RequestContext.create(orm.em, next)` immediately after CORS/JSON parsing and before any
`/api` route is mounted. `attachDatabaseRoutes` no longer registers its own `RequestContext` (the
comment explains the dependency). In `createServerRuntime.ts`, the ORM is now initialised before
`createServerApp` is called in the DB-enabled path so it can be passed in. The DB-disabled path
is extracted to a clean else-equivalent code block after the early return.

### H3 — getPromptMatrixState 10k unfiltered PromptExecution query
**File:** `docker/server/src/services/pipelineService.ts`

Replaced the empty-filter `em.find(PromptExecution, {}, { limit: 10_000 })` with a date-scoped
filter `{ startedAt: { $gte: cutoffDate } }` where `cutoffDate` is `safeDaysLimit` days ago at
start of day UTC. The `limit: 10_000` guard is removed since the date filter already bounds the set.

### M1 — ingestAndAnalyze stale cache return logs at info not warn
**File:** `docker/server/src/services/analysisService.ts`

Upgraded the log from `serverLogger.info` to `serverLogger.warn` and enriched the payload with
`corpusVersion` and `cachedAt` so operators can identify concurrent-ingestion stale returns.

### M3/P3 — getMissionStatsView three sequential DB queries
**File:** `docker/server/src/services/pipelineService.ts`

Wrapped all three `em.getConnection().execute()` calls in a single `Promise.all([...])`, pulling
the destructured results from the resolved tuple. The queries are fully independent read-only
aggregates and now run concurrently on the Postgres connection pool.

### M5 — StatsPanel "error" badge triggered by non-critical fetch failures
**File:** `docker/client/src/components/dashboard/StatsPanel.tsx`

`encounteredFailure` is now only set to `true` when the *summary* fetch rejects. The daily volume
and hourly fetches log errors but do not flip `hasError`. This means the badge stays "ready" (with
partial data) when only secondary fetches degrade, matching operator expectations.

### L3 — fetchStatsSummary null return indistinguishable from loading
**File:** `docker/client/src/components/dashboard/StatsPanel.tsx`

In the `statsSummaryResult.status === "fulfilled"` branch, a `null` value (which `fetchStatsSummary`
returns on non-ok responses) is now treated as a failure: `encounteredFailure = true` plus a
`clientLogger.warn`. This makes DB-disabled / 503 states show the error message rather than the
perpetual loading skeleton.

### M6 — Correlated ORDER BY subquery in loadTranscriptCandidates
**File:** `docker/server/src/services/transcriptCandidateService.ts`

Replaced the `ORDER BY (select count(*) from unnest(u.tokens) ...)` correlated subquery with a
`CROSS JOIN LATERAL (select count(*)::int as token_overlap_count from unnest(u.tokens) ...)`. The
lateral is evaluated once per row during the scan, not once per sort comparison, avoiding O(n × k)
unnest evaluations. Parameter binding order updated accordingly (`queryTokens` now appears twice in
the params array).

### L2 — DESC+LIMIT then ASC re-sort looks like a bug
**File:** `docker/server/src/server/createServerRuntime.ts`

Added a multi-line comment explaining the intentional pattern: DESC+LIMIT retrieves the most recent
50k rows using the timestamp index, and the subsequent in-memory ASC re-sort puts them in
chronological order for the analysis service. Without the comment, the re-sort appears redundant
and is a regression risk.

## What Was Not Fixed / Deferred

### P4 — Per-day LLM calls in ingestAndAnalyze not parallelised
Deferred by design. The `LlmClient.enqueue` queue serialises all actual HTTP calls regardless.
Parallelising day dispatch only reduces inter-day scheduling overhead, not wall-clock time for the
LLM calls themselves. Left as a documented future optimisation.
