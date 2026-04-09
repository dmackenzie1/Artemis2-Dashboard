# 2026-04-09 - Daily + notable pipeline alignment

## Summary
- Updated the Daily page to merge canonical `/api/pipeline/daily-summaries` content over `/api/dashboard` day cards so operators see persisted day synthesis text (including daily issues/watchouts sections) instead of only transient cache summaries.
- Added hourly channel identifier coverage to dashboard day stats (`hourlyChannelLeads`) and surfaced those channel identifiers on each Daily page hourly update card.
- Hardened `/api/pipeline/notable-moments` parsing to accept mixed day payload shapes (`unknown` entries that may be objects or strings), preventing full endpoint failure when LLM output drifts from strict string-only arrays.
- Updated notable-moments generation inputs to include persisted canonical daily summary text per day, so notable synthesis explicitly reuses the new daily summaries pipeline output.
- Increased timeline density caps (summary highlights/topics/notable utterances) so Timeline surfaces more mission material per day.

## What Did Not Work
- No major dead-end implementation branch was required; the main adjustment was avoiding a breaking API contract change by adding `hourlyChannelLeads` as an optional stats field rather than replacing existing hourly payload structures.
