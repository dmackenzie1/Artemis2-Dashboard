# 2026-04-09 - Unified DB-backed daily summary foundation

## Summary
- Extended `daily_summaries` with a `channelGroup` dimension and switched uniqueness from day-only to `(day, channelGroup)` so canonical wildcard summaries (`*`) can coexist with future channel-group variants.
- Updated pipeline daily-summary persistence/readback to use the canonical wildcard channel group (`*`) when writing and rehydrating day summaries for mission synthesis.
- Reworked pipeline prompt source-context assembly so prompt execution now builds day-grouped source documents directly from `transcript_utterances` in the database instead of reading source files from disk.
- Removed analysis ingestion `daily_summary` LLM prompting and switched that path to read canonical persisted `daily_summaries` output by day (with a pending message fallback until pipeline output exists).
- Removed filesystem source-document reingest usage from the pipeline runtime path and made manual reingest report DB-derived day context counts.
- Added optional `channel` filters for `/api/search/utterances` and `/api/chat` so retrieval and answer grounding can be scoped to channel-specific traffic when needed.
- Removed remaining `top_topics` sample payload slicing in analysis ingestion so topic extraction now also submits full day entries.
- Removed legacy `SourceDocument` schema registration from MikroORM runtime entities so active ORM models align with DB-backed transcript + prompt/daily-summary workflows.
- Added a new pipeline API surface `/api/pipeline/daily-summaries` with optional `channelGroup` query support (`*` default) to complete channel-group retrieval plumbing for summary artifacts.
- Restricted pipeline prompt execution to an explicit runnable set (`daily_summary`, `mission_summary`, `recent_changes`, `notable_moments`) so non-pipeline prompt files do not execute as stealth prompt runs.
- Updated `daily_summary` and `top_topics` prompt instructions to emphasize channel attribution + timeline coverage and to prevent metadata invention when channel/timestamp evidence is missing.

## What Did Not Work
- A first pass deferred removing `SourceDocument` ORM schema registration while runtime prompt sourcing was moved to DB-backed transcript utterances first; this branch now removes that registration once the runtime switch proved stable in lint/test runs.

## Validation
- Ran lint and test suites from the repo root.
