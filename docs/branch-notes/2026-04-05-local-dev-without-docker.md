# Branch Notes - Local Dev Without Docker for Transcript Work

## What Was Built
- Added a local-development toggle (`TRANSCRIPTS_DB_ENABLED`) to keep PostgreSQL-backed transcript routes optional.
- Changed backend defaults so `DB_HOST` resolves to `localhost` when not running in Docker.
- Updated Docker Compose backend environment to explicitly enable transcript DB features in containerized runs (`TRANSCRIPTS_DB_ENABLED=true`, `DB_HOST=db`).
- Updated server startup to only initialize MikroORM when transcript DB mode is enabled; otherwise, `/api/transcripts/context` returns a clear 503 guidance response.
- Added root scripts `dev:server` and `dev:client` so backend/frontend can run in separate local terminals without Docker.
- Documented local non-Docker workflow and clarified Postgres requirements in README.

## What Did Not Work
- Leaving transcript DB enabled by default caused local backend startup failures when PostgreSQL was not running.
- This was corrected by making transcript DB mode opt-in for local development.

## Follow-up Recommendations
- Add a lightweight health endpoint for transcript DB status (enabled, connected, migration state) to simplify troubleshooting.
