# TalkyBot Transcript Review Dashboard

A full-stack internal demo that ingests Artemis communication transcript CSVs (from TalkyBot exports) and produces LLM-assisted mission review outputs.

TalkyBot source system: https://talkybot.fit.nasa.gov/

## Mission intent

- Supports delayed review and post-mission analysis workflows.
- Focuses on what already happened (summaries, topics, timeline activity, and transcript-grounded query/chat).
- Not intended as real-time flight-control decision support.

## Repository layout

- `docker/client`: React 19 + Vite frontend workspace.
- `docker/server`: Express 5 + TypeScript backend workspace.
- `docker/nginx`: Reverse proxy used in Dockerized runs.
- `prompts`: Prompt templates used by pipeline jobs.
- `source_files`: Operator-provided transcript/source inputs.
- `docs/branch-notes`: Task-level engineering paper trail.

## Project documentation map (single-source, no duplication)

- Top-level setup and operations: this file.
- Frontend implementation map: `docker/client/README.md` and `docker/client/ARCHITECTURE.md`.
- Backend implementation map: `docker/server/README.md` and `docker/server/ARCHITECTURE.md`.
- UI visual direction and guardrails: `docs/ui-design-guidance.md`.

## Quick start (Docker)

1. Copy env file:

```bash
cp .env.example .env
```

2. (Optional) install dependencies for local lint/test:

```bash
npm install
```

3. Start stack:

```bash
docker compose up --build
```

4. Open `http://localhost:8080`.

## Local Node development (without Docker)

```bash
npm install
npm run dev:server
npm run dev:client
```

Open the Vite URL (typically `http://localhost:5173`).

## Core commands

```bash
npm run lint
npm run test
npm run build
```

## API overview

- Health + overview: `/api/health`, `/api/dashboard`, `/api/timeline`
- Mission stats: `/api/stats/*`
- Prompt pipeline: `/api/pipeline/*`
- Query/chat: `POST /api/chat`
- System logs: `/api/system-logs`

See backend architecture docs for detailed endpoint behavior.
