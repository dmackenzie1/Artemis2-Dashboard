# Branch Notes — 2026-04-05 — db-ingestion-verification-and-word-counts

## What Changed
- Added a dedicated backend transcript ingestion service that:
  - reads all transcript CSV files from `TRANSCRIPT_CSV_DIR`,
  - clears existing `transcript_utterances`,
  - inserts new rows in batches,
  - returns/logs processed file count, inserted count, skipped count, and final DB utterance count.
- Wired DB transcript ingestion into:
  - backend startup flow (runs before the server emits the "Backend is ready" log),
  - `POST /api/ingest` flow.
- Added `wordCount` to the `transcript_utterances` entity and populate it from each row’s text token count.
- Updated the standalone `db:ingest` script to reuse the shared transcript ingestion service.
- Removed the PostgreSQL named Docker volume from `docker-compose.yml` so DB storage is ephemeral for now.

## What Did Not Work
- No failed approach was required for this change set.

## Notes
- Existing SQL stats that compute word totals from `text` remain valid; `wordCount` is now available for future query optimization and per-row analytics.
