# Artemis 2 Mission Intelligence Dashboard

A full-stack internal demo that ingests Artemis communication transcript CSVs and turns them into LLM-powered mission intelligence.

## What it does

- Ingests transcript CSV files from `source_files/` (or configured data directory)
- Ingests source text files from `source_files/` into Postgres for scheduled prompt runs
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

5. Backend startup now auto-runs ingestion and scheduled prompt workflow; once loaded, open the Overview page for mission outputs.

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

- **By default, yes.** Database-backed transcript/pipeline features are enabled by default (`TRANSCRIPTS_DB_ENABLED=true`).
- If Postgres is not available for a local-only frontend/backend smoke run, set `TRANSCRIPTS_DB_ENABLED=false` to disable transcript/pipeline DB routes temporarily.
- For full local functionality without Docker, run a local Postgres instance and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` in `.env`.


## Capture client screenshots (Codex-friendly)

When the stack is running at `http://localhost:8080`, run:

```bash
npm run screenshot:client
```

This writes `artifacts/client-screenshot.png` and supports optional overrides:

```bash
npm run screenshot -- --url http://localhost:8080 --output artifacts/my-shot.png --retries 12 --timeout-ms 180000
```

If Playwright cannot download its managed browser in your network, point the script to an existing Chromium/Chrome binary:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run screenshot:client
# or
npm run screenshot -- --url http://localhost:8080 --output artifacts/client-screenshot.png --browser-path /usr/bin/google-chrome
```

## Ingestion workflow

### Docker volume mapping defaults

Containerized runs intentionally keep database/cache storage internal to Docker. Only operator-editable inputs are bind-mounted from the host:

- `./source_files -> /app/source_files`
- `./prompts -> /app/prompts`

- Drop one or many transcript CSV files into `source_files/`
- Trigger a manual re-run with `POST /api/ingest` when you need an immediate refresh outside the startup/scheduled flow
- Ingestion is safe to rerun and always rebuilds normalized records + derived intelligence

## Source-file workflow (new)

- Drop 4-6 text/code files into `source_files/`
- Backend ingests them into Postgres (`source_documents`)
- Prompt definitions are sourced from `/prompts/*.txt` and stored with IDs + update timestamps
- Prompt executions run sequentially (never in parallel) and store results in `prompt_executions`
- Scheduled pipeline reruns every `PIPELINE_INTERVAL_HOURS` (default 6 hours)

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
- `GET /api/notable-utterances?limit=10&days=7`
- `POST /api/chat` with `{ "query": "..." }`
- `GET /api/pipeline/dashboard`
- `POST /api/pipeline/ingest`
- `POST /api/pipeline/run`

## Internal LLM API configuration

Set in `.env`:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

If `ANTHROPIC_BASE_URL` is empty, backend uses deterministic fallback text to keep the demo working offline.
