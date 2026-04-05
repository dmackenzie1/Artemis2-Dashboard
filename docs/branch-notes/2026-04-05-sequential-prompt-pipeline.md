# 2026-04-05 — Sequential prompt pipeline over ingested source files

## Summary
- Added a Postgres-backed source-file ingestion workflow that scans `source_files/`, stores checksums/content in `source_documents`, and supports manual re-ingest.
- Added prompt definition persistence (`prompt_definitions`) with stable IDs and update timestamps derived from `/prompts/*.txt`.
- Added sequential (non-parallel) prompt execution persistence (`prompt_executions`) with status, start/end timestamps, output, and failure message.
- Wired a scheduled run loop in the backend startup path to execute the pipeline every `PIPELINE_INTERVAL_HOURS` (default 6).
- Added pipeline endpoints: `GET /api/pipeline/dashboard`, `POST /api/pipeline/ingest`, `POST /api/pipeline/run`.

## What Did Not Work
- Initial attempt to keep prompt execution output in the existing JSON cache file did not satisfy the requirement to persist prompt IDs and run metadata in a database.
