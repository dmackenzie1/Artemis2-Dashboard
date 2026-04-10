# Server (backend workspace)

Express 5 + TypeScript API server for transcript ingestion, LLM analysis orchestration, and pipeline-backed dashboard data.

## Scope

This workspace owns:
- API routing and validation
- CSV + source document ingestion
- Prompt execution pipeline and caching
- Postgres/MikroORM entities and query services
- Logging and startup scheduling behavior

## Commands

From repository root:

```bash
npm run dev:server
npm run lint -w backend
npm run test -w backend
npm run build -w backend
npm run db:ingest -w backend
```

## Runtime notes

- `TRANSCRIPTS_DB_ENABLED=true` enables DB-backed routes (`/api/transcripts`, `/api/pipeline`, `/api/stats`).
- Redis-backed LLM cache requires the `redis` npm package (already listed in this workspace dependencies) and a reachable Redis instance (`REDIS_CACHE_ENABLED=true`, `REDIS_URL=redis://redis:6379` in Docker Compose).
- Startup sequence loads cache, ingests CSV data, and optionally runs prompt pipeline.
- System logs route exposes prompt artifacts from configured local directories.

## Architecture docs

For service-level responsibilities and file-by-file mapping, see `docker/server/ARCHITECTURE.md`.

## Documentation contracts

- Keep this README focused on backend scope, commands, and runtime behavior only.
- Keep implementation-level service/file ownership in `ARCHITECTURE.md` (single source of truth for backend internals).
- When changing transcript retrieval/search behavior, preserve evidence priority of `timestamp/date + channel + transcript text` and treat duration/language/translated/filename metadata as optional unless explicitly requested.
