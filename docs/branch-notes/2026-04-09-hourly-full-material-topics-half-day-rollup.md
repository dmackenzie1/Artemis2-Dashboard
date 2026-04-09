# 2026-04-09 — Hourly full-material payloads + top-topics half-day rollup

## Summary
- Removed hourly prompt sampling in `AnalysisService` and now send all utterances for each hour with a narrowed prompt payload schema (`timestamp`, `day`, `hour`, `channel`, `text`).
- Reworked top-topics generation to run in half-day windows (`00-11`, `12-23`) and then perform a day-level rollup synthesis from parsed window topics.
- Reordered ingestion orchestration so manual and auto-triggered ingestion refresh transcript DB/pipeline before regenerating analysis cache.

## Why
- Top-topics requests were failing due to oversized single-day payloads.
- Operators requested no random/sampled hourly material.
- Analysis should run against freshly ingested transcript state.

## What Changed
- `docker/server/src/services/analysisService.ts`
  - Added prompt utterance shaping helper.
  - Added hour parsing + top-topics half-day windowing helper.
  - Hourly prompt payload now includes full per-hour utterances (no `sample` field).
  - Top-topics now runs windowed map calls and a rollup call.
- `docker/server/src/routes/api.ts`
  - `/api/ingest` now executes ingestion callback first, then `ingestAndAnalyze`.
- `docker/server/src/index.ts`
  - Auto-ingestion now refreshes transcript+pipeline first, then runs `analysisService.ingestAndAnalyze()`.

## What Did Not Work
- Initial thought was to keep single top-topics call and rely on model fallback/retries; this does not address context-window overflow failures and was rejected in favor of windowed map+rollup.

## Follow-ups
- Add explicit token preflight/configured context limits (`LLM_CONTEXT_WINDOW_TOKENS`, reserved output budget) and optional recursive chunking inside each half-day window for very dense days.
- Introduce persisted analysis job state for partial success visibility by day/component.
