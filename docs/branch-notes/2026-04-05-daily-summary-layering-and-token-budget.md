# 2026-04-05 - Daily summary layering and token budget controls

## Summary
- Updated pipeline prompt-submission business logic to group source documents by mission day for `daily_summary` runs and attach explicit 5,000-10,000 word targets per day group.
- Updated sequential prompt execution flow so `mission_summary` consumes the latest generated `daily_summary` output (when available) instead of always re-sending all raw source documents.
- Added `LLM_MAX_TOKENS` env configuration and wired it into `LlmClient` request payloads to support larger day-level synthesis responses.
- Updated prompt templates so `daily_summary` requests structured long-form day sections and `mission_summary` explicitly performs synthesis over daily summaries.

## What Did Not Work
- A first approach to keep `max_tokens` fixed at 300 while requesting 5,000-10,000 words was not viable because responses would be structurally truncated before meeting the requested day-level summary depth.

## Validation Notes
- Ran workspace lint and test commands after implementing the pipeline and prompt changes.
