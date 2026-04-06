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
- Startup sequence loads cache, ingests CSV data, and optionally runs prompt pipeline.
- System logs route exposes prompt artifacts from configured local directories.

## Architecture docs

For service-level responsibilities and file-by-file mapping, see `docker/server/ARCHITECTURE.md`.
