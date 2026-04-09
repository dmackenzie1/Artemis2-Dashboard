# 2026-04-09 - Pipeline contract hardening

## Summary
- Added deterministic transcript file-name parsing/sorting for full-day, partial-sequence, and hour-range CSV inputs.
- Added ingest-time validation logs for filename day/hour buckets versus row timestamps, including overlapping hour-range warnings.
- Added shared LLM JSON-boundary normalization/contract validation utility and applied it to time-window and hourly summary JSON parsing.
- Added fail-fast oversized prompt rejection in `LlmClient` plus bounded per-hour/per-window prompt sampling in analysis to reduce payload size variance.
- Added placeholder-aware mission-summary gating to prevent authoritative rollups when day summaries are not yet canonical.
- Added targeted tests for filename parsing/order, JSON fence/HTML/malformed handling, ingestion mismatch logging, and placeholder-gated mission summary behavior.

## What Did Not Work
- A first-pass regex replacement in `analysisService.ts` briefly produced an invalid control-character pattern in `notableSignalPattern`; corrected by explicitly restoring the escaped `\b` boundary regex.

## Validation
- `npm run lint`
- `npm run test`
