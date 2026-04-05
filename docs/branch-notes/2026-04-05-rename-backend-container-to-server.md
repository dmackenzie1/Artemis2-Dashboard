# 2026-04-05 — Rename backend container service to server

## Summary
- Renamed the Docker Compose service key from `backend` to `server`.
- Updated nginx API upstream routing to point at `server:4000` instead of `backend:4000`.
- Updated nginx `depends_on` so it waits on the `server` service name.

## What Did Not Work
- Initial broad text search included many matches under `node_modules` and was too noisy to use directly for precise edits.

## Validation
- `npm run lint`
- `npm run test`
