# 2026-04-05 — Source-files transcript ingestion default

## What changed
- Consolidated transcript ingestion to a single directory setting by using `DATA_DIR` for transcript CSV ingestion paths in startup/manual ingestion and script entry points.
- Removed `TRANSCRIPT_CSV_DIR` from backend env schema and `.env.example`.
- Updated `docker-compose.yml` server environment overrides to set only `DATA_DIR=/app/source_files` and removed the duplicate transcript-specific override.
- Kept the `TB-Artemis-Summaries` bind mount removed so `source_files` remains the only host-mounted transcript ingestion directory.
- Updated README ingestion documentation to describe `source_files/` as the transcript CSV input location.

## What did not work
- The initial change kept both `DATA_DIR` and `TRANSCRIPT_CSV_DIR` pointed at the same path, which created unnecessary config duplication; this follow-up simplifies to `DATA_DIR` only.
