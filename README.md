# TalkyBot Transcript Review Dashboard

A full-stack internal demo that ingests Artemis communication transcript CSVs (from TalkyBot exports) and produces LLM-assisted mission review outputs.

TalkyBot source system: https://talkybot.fit.nasa.gov/

## Mission intent

- Supports delayed review and post-mission analysis workflows.
- Focuses on what already happened (summaries, topics, timeline activity, and transcript-grounded query/chat).
- Not intended as real-time flight-control decision support.

## Transcript query evidence priorities

- Query/search workflows should prioritize `timestamp/date + channel + transcript text` as the canonical evidence tuple.
- Metadata such as `duration`, `language`, `translated`, and `filename` is secondary and should only be used when explicitly requested by an operator.
- Channel identity is mission-critical for interpretation. Keep crew loops (for example OE/XPL/SpaceOE) and flight-control loops (for example Flight Director/ISS/ORION MER manager) distinguishable in retrieval and synthesis outputs.

## Repository layout

- `docker/client`: React 19 + Vite client workspace.
- `docker/server`: Express 5 + TypeScript backend workspace.
- `docker/nginx`: Reverse proxy used in Dockerized runs.
- `prompts`: Prompt templates used by pipeline jobs.
- `source_files`: Operator-provided transcript/source inputs.
- `docs/branch-notes`: Task-level engineering paper trail.

## Project documentation map (single-source, no duplication)

- Top-level setup and operations: this file.
- Client implementation map: `docker/client/README.md` and `docker/client/ARCHITECTURE.md`.
- Backend implementation map: `docker/server/README.md` and `docker/server/ARCHITECTURE.md`.
- UI visual direction and guardrails: `docs/ui-design-guidance.md`.

### Dashboard component ownership contract

- Overview panel components are intentionally independent: each panel performs its own API calls, tracks its own loading/error/result state, and owns its own polling cadence.
- `DashboardPage` is intentionally thin and only coordinates cross-panel refresh notifications (admin-triggered refresh token), not shared data orchestration.
- This separation is required so one panel failure or slow API response does not block unrelated dashboard components.

## Quick start (Docker)

1. Generate local env file from `env.config.ts`:

```bash
npx @emss/make-dotenv
```

2. (Optional) install dependencies for local lint/test:

```bash
npm install
```

3. Start stack:

```bash
./appcompose dev build
./appcompose dev up -d
```

4. Open `http://localhost:8080`.

Redis-backed LLM response caching is enabled in Docker Compose by default (`redis` service + `REDIS_URL=redis://redis:6379` on `server`).

### Optional local HTTPS (dev SSL)

If you want TLS termination at nginx in local Docker runs:

```bash
./scripts/make-dev-ssl-cert.sh
./appcompose dev up -d --force-recreate nginx
```

Then open `https://localhost:8443` (HTTP on `http://localhost:8080` redirects to HTTPS).

## Local Node development (without Docker)

```bash
npm install
npm run dev:server
npm run dev:client
```

Open the Vite URL (typically `http://localhost:5173`).

## Deployment notes

- Local development remains the primary/default workflow for this repository.
- For EC2 deployment/runbook details (AL2023, package bootstrap script, env variables, Docker Compose startup), see `docs/deployment.md`.

## Core commands

```bash
npm run lint
npm run test
npm run build
```

If TypeScript linting reports `Cannot find module 'redis'`, re-run workspace install from the repo root:

```bash
npm install
```

## API overview

- Health + overview: `/api/health`, `/api/dashboard`, `/api/timeline`
- Mission stats: `/api/stats/*`
- Prompt pipeline: `/api/pipeline/*`
- Query/chat: `POST /api/chat`
- System logs: `/api/system-logs`

See backend architecture docs for detailed endpoint behavior.
