# Server Architecture

This document is the implementation map for `docker/server/src`.

## Request/runtime flow

1. `index.ts` builds the Express app, loads env config, wires services/routes.
2. DB-enabled mode initializes MikroORM, schema sync, and pipeline/stats/transcript routes.
3. Startup ingestion runs transcript ingestion + analysis cache refresh (+ pipeline run when enabled).
4. Pollers refresh LLM connectivity and scheduled pipeline runs.
5. `/api/events` streams Server-Sent Events for dashboard/pipeline/stats invalidation and LLM connectivity updates.

## File-by-file map (`src/`)

| File | Purpose |
| --- | --- |
| `index.ts` | Process entrypoint, service construction, route mounting, startup/scheduling orchestration, global error handler. |
| `env.config.ts` | Typed environment configuration and defaults. |
| `types.ts` | Shared server-side DTO/type definitions used across services. |
| `mikro-orm.config.ts` | MikroORM/Postgres configuration object. |
| `analysisService.ts` | In-memory dashboard cache builder + non-DB analysis/chat orchestration logic. |
| `analysisService.test.ts` | Regression tests for analysis service output/behavior. |
| `services/llmClient.ts` | LLM transport wrapper, connectivity checks, debug artifact persistence, and fallback behavior. |
| `services/llmClient.test.ts` | Unit tests for LLM client transport/fallback/debug behaviors. |
| `services/pipelineService.ts` | Prompt pipeline scheduler/runner, execution persistence, prompt dashboard and notable moments shaping. |
| `services/pipelineService.test.ts` | Pipeline ordering/state regression tests. |
| `services/transcriptIngestionService.ts` | CSV ingestion + source-file ingestion into database with counters/summary output. |
| `services/transcriptIngestionService.test.ts` | Ingestion parser/behavior tests. |
| `services/statsService.ts` | DB-backed mission statistics query service (summary/day/hour-by-channel). |
| `services/systemLogsService.ts` | Prompt artifact discovery/read service backing system logs API. |
| `services/systemLogsService.test.ts` | Unit tests for log listing/read behavior. |
| `services/liveUpdateBus.ts` | In-process pub/sub bus used by SSE route and runtime services to publish live update events. |
| `routes/api.ts` | Core `/api` routes (health, ingest, dashboard, timeline, stats, topics, notable utterances, chat). |
| `routes/pipeline.ts` | `/api/pipeline` routes (dashboard/run/ingest/stats/notable moments). |
| `routes/transcripts.ts` | `/api/transcripts/context` retrieval route with query validation and formatting options. |
| `routes/systemLogs.ts` | `/api/system-logs` list + file-detail routes. |
| `entities/TranscriptUtterance.ts` | Transcript utterance persistence model. |
| `entities/SourceDocument.ts` | Source document persistence model used by prompts. |
| `entities/PromptDefinition.ts` | Prompt definition persistence model for tracked prompt files. |
| `entities/PromptExecution.ts` | Prompt execution history/cache persistence model. |
| `entities/DailySummary.ts` | Persisted day-level summary artifact store (summary + generated metadata + per-day counts). |
| `lib/csvIngest.ts` | Low-level CSV parsing + row normalization helpers. |
| `lib/csvIngest.test.ts` | CSV parsing/edge-case unit tests. |
| `lib/dayjs.ts` | Shared UTC-configured dayjs singleton bootstrap. |
| `lib/prompts.ts` | Prompt parsing/metadata helper utilities. |
| `scripts/ingest-transcripts.ts` | Manual CLI script for transcript ingestion into DB. |
| `utils/logging/serverLogger.ts` | Structured server logging + unknown-error serialization helpers. |

## Dead-code and hygiene notes (April 6, 2026)

- No orphaned route modules or services were found in `src/`; all route factories are mounted from `index.ts`.
- `ts-prune` currently reports only type exports used in-module (false positives) for server files; no confirmed dead runtime exports were removed.

## Pipeline storage update (April 8, 2026)

- Daily summary prompt output is now parsed and upserted into `daily_summaries` with metadata (`generatedAt`, `wordCount`, `utteranceCount`, `sourceDocumentCount`) for deterministic reuse.
- Notable moments daily targets are now configurable by environment and can scale up for high-signal days.
