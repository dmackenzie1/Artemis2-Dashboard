# 2026-04-06 — Auto-ingest on source file drop/replacement

## Summary
- Added backend filesystem watchers for `DATA_DIR` and `SOURCE_FILES_DIR` so file create/update/rename events trigger a debounced auto-ingestion cycle.
- Auto-ingestion now reuses existing ingestion/pipeline paths by running analysis cache rebuild plus transcript DB refresh and prompt pipeline refresh.
- Added queueing guards so overlapping file events do not run concurrent ingest cycles.

## What Did Not Work
- A first draft attempted immediate ingestion for every watcher event, but that would trigger too many duplicate runs during multi-file copy/replace operations. The final implementation uses a 3-second debounce and a single queued rerun flag.

## Validation
- `npm run lint -w backend`
- `npm run test -w backend`
