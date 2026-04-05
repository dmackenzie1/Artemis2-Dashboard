# 2026-04-05 - Default DB enabled and pipeline schedule alignment

## Summary
- Switched backend env default for `TRANSCRIPTS_DB_ENABLED` from `false` to `true` so DB-backed transcript/pipeline behavior is active by default.
- Kept existing `PIPELINE_INTERVAL_HOURS=6` and `PIPELINE_AUTO_RUN=true` defaults as-is.
- Updated `.env.settings` template and README local-dev guidance to reflect DB-enabled default behavior and fallback toggle instructions.

## What Did Not Work
- No runtime failures encountered during this config-default update; no failed implementation attempts were needed.
