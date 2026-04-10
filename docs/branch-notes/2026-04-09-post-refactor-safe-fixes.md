# Branch Notes — 2026-04-09: Post-Refactor Safe Fixes

## Context

Applied the safe, low-risk findings identified during the principal-level post-refactor code review
(see CHANGELOG entries dated 2026-04-09). All changes are isolated to single call sites and carry
no schema or API contract changes.

## What Was Fixed

### H1 — `runManualIngestion` did not call `ingestAndAnalyze()`
**File:** `docker/server/src/services/ingestionSchedulerService.ts`

The method ran `runTranscriptAndPipelineRefresh` (DB ingestion + LLM pipeline) but then read the
*old* cache value from `analysisService.getCache()` before broadcasting `dashboard.cache.updated`.
This meant the SSE event fired with stale `generatedAt`/`totalDays`, causing clients to refetch and
receive old data. Added `await this.options.analysisService.ingestAndAnalyze()` and used its return
value for both the event log and the broadcast payload.

### L4 — `LiveUpdateBus` hit Node.js max listener warning
**File:** `docker/server/src/services/liveUpdateBus.ts`

Added a constructor that calls `this.emitter.setMaxListeners(200)`. Node.js default is 10; every
SSE browser tab adds one listener, so a multi-tab session would spam `MaxListenersExceededWarning`
to stderr.

### M2 — Redis `connected` flag never reset after disconnect
**File:** `docker/server/src/services/redisLlmCache.ts`

Added `this.client.on("end", () => { this.connected = false; })` in `connect()`. Without this, a
Redis restart left `this.connected = true` permanently, causing all subsequent `connect()` calls to
return early and the LLM cache to silently miss every Redis key until server restart.

### M4 — SSE reconnect did not trigger a global dashboard refresh
**Files:** `docker/client/src/utils/live/liveEvents.ts`,
           `docker/client/src/context/LiveUpdatesContext.tsx`

Added an `onReconnect?: () => void` parameter to `subscribeToLiveUpdates`. The function tracks
whether the first `ready` event has been seen; subsequent `ready` events (browser auto-reconnect
after a server restart or network drop) call `onReconnect`. `LiveUpdatesContext` wires this to
`requestGlobalRefresh`, so panels immediately refetch after a reconnect instead of waiting up to
30 minutes for the next poll.

### L1 — `docker-compose.yml` Postgres health condition
**File:** `docker-compose.yml`

Added a `pg_isready` healthcheck to the `db` service. Changed `server` depends_on condition from
`service_started` to `service_healthy`. Added `restart: on-failure` to the `server` service so
Docker restarts it automatically if it crashes before Postgres is ready.

### H2 — N+1 queries in `PipelineService.getDashboardView`
**File:** `docker/server/src/services/pipelineService.ts`

The method looped over every `PromptDefinition` and issued a separate `em.findOne(PromptExecution)`
for each one (N+1 pattern). Replaced with a single `em.find` for all executions belonging to the
known prompt IDs, then built a `Map<promptId, latestExecution>` by taking the first entry per ID
from the already-sorted-newest-first result.

### M7 — `persistSummaryArtifacts` issued one `findOne` per parsed day section
**File:** `docker/server/src/services/pipelineService.ts`

The method matched parsed LLM output sections against existing DB rows with a `findOne` inside the
loop. Replaced with a single `em.find` query filtering on `{ $in: periodStarts }`, then looked up
matches from a `Map` keyed by `periodStart.getTime()`.

## What Did Not Work / Was Not Attempted

- **C1 (full table scan in `buildSourceContextFromTranscriptDatabase`)** — the fix requires
  threading `changedDayKeys` through the call, verifying that `mission_summary` still gets all-day
  summaries rather than a filtered subset, and updating callers. Left for a dedicated task with
  integration test coverage.

- **C2 (RequestContext middleware ordering)** — requires rearchitecting the `createServerApp` /
  `attachDatabaseRoutes` registration order and verifying all service routes behave correctly with
  a properly scoped EM. Left for a dedicated task with integration tests.

- **H3 (`getPromptMatrixState` loads 10k rows without date filter)** — safe to fix but not
  attempted here; left for the next task.

- **M1, M3, M5, M6, P4** — deferred; see the verification prompt for details.
