# 2026-04-09 - Summary artifacts model and delta file ingestion

## Summary
- Replaced day-only `daily_summaries` persistence with a new `summary_artifacts` schema keyed by summary type + explicit period range + channel group.
- Added summary inventory/query APIs (`/api/pipeline/summaries` and `/api/pipeline/summaries/catalog`) so operators can inspect exactly what summary artifacts exist.
- Switched analysis-side daily summary lookup to read canonical `daily_full` artifacts from `summary_artifacts`.
- Reworked transcript ingestion to a file-delta model using a persisted ingestion manifest table (`ingestion_source_files`), so unchanged files are skipped and changed files are replaced by `sourceFile` identity.
- Updated pipeline orchestration so ingestion-driven runs pass concrete changed-day keys and only mark source-doc changes when files actually changed.
- Unified notable-utterance token scoring with the shared tokenizer path used by ingestion/search retrieval.
- Switched ingest checksum generation to stream-based hashing (instead of full-file reads) and hardened day-key filtering fallback so pipeline day-scoped filtering cannot silently drop all source context when provided keys do not match grouped source docs.

## What Did Not Work
- A first pass attempted to preserve the old `/api/pipeline/daily-summaries` route and map it silently, but this kept type/contracts ambiguous versus the new `summary_artifacts` model; the branch now promotes the explicit summaries endpoints directly.
- A first pass considered keeping full-table transcript deletion before ingest and only adding per-file checksums; that still caused unnecessary churn and defeated delta goals, so it was replaced with per-file replacement keyed by `sourceFile`.

## Validation
- `npm run lint`
- `npm run test`
