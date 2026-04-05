# Artemis 2 Mission Intelligence Dashboard

A full-stack internal demo that ingests Artemis communication transcript CSVs and turns them into LLM-powered mission intelligence.

## What it does

- Ingests all CSV files from `sample_data/` (or configured data directory)
- Handles quoted text, commas, multiline transcript text, and trailing CSV columns
- Generates:
  - hourly summaries
  - daily summaries
  - mission summary
  - top daily topics
  - recent change analysis
  - chat responses with evidence snippets
- Exposes APIs via Node + Express (`/docker/server`)
- Renders a polished mission-control style React UI (`/docker/client`)
- Runs locally with Docker Compose + NGINX reverse proxy (`/docker/client`, `/docker/server`, `/docker/nginx`)

## Quick start

1. Copy env file:

```bash
cp .env.example .env
```

2. Install dependencies locally (optional for lint/test):

```bash
npm install
```

This project is Node/TypeScript only (no Python runtime required).

3. Run with Docker:

```bash
docker compose up --build
```

4. Open `http://localhost:8080`

5. In the app, click **Rebuild from CSV folder** to ingest and regenerate mission intelligence.

## Run without Docker (local Node dev)

You can run client/server directly for fast local testing:

1. Install deps:

```bash
npm install
```

2. Terminal A (backend):

```bash
npm run dev:server
```

3. Terminal B (frontend):

```bash
npm run dev:client
```

4. Open the Vite URL printed by the frontend dev server (typically `http://localhost:5173`).

### Do I need Postgres for local dev?

- **No**, not for the existing dashboard ingestion/chat flow (`/api/ingest`, `/api/dashboard`, `/api/chat`).
- The new transcript context endpoint (`/api/transcripts/context`) is **optional** and only enabled when `TRANSCRIPTS_DB_ENABLED=true`.
- If you want transcript DB features without Docker, run a local Postgres instance and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` in `.env`.

## Ingestion workflow

- Drop one or many CSV files into `sample_data/`
- Re-run ingestion from the UI or call `POST /api/ingest`
- Ingestion is safe to rerun and always rebuilds normalized records + derived intelligence

## Prompt management

Prompts are editable text files in `/prompts`:

- `hourly_summary.txt`
- `daily_summary.txt`
- `mission_summary.txt`
- `top_topics.txt`
- `topic_page.txt`
- `recent_changes.txt`
- `chat_system.txt`

## API endpoints

- `GET /api/health`
- `POST /api/ingest`
- `GET /api/dashboard`
- `GET /api/timeline`
- `GET /api/stats`
- `GET /api/topics/:topicTitle`
- `POST /api/chat` with `{ "query": "..." }`

## Internal LLM API configuration

Set in `.env`:

- `LLM_API_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

If `LLM_API_URL` is empty, backend uses deterministic fallback text to keep the demo working offline.
