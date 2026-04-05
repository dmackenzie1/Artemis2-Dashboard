# 2026-04-05 - Daily summary layering and token budget controls

## Summary
- Updated pipeline prompt-submission business logic to store `daily_summary` runs as a compact day/checksum manifest instead of embedding full source file content in a single request payload.
- Added bounded per-day chunk execution for `daily_summary` so large source corpora are analyzed in smaller chunk prompts, then synthesized into one final per-day summary.
- Updated sequential prompt execution flow so `mission_summary` consumes the latest generated `daily_summary` output (when available) instead of re-sending all raw source documents.
- Added `LLM_MAX_TOKENS` env configuration and wired it into `LlmClient` request payloads to support larger day-level synthesis responses.
- Updated prompt templates so `daily_summary` requests structured long-form day sections and `mission_summary` explicitly performs synthesis over daily summaries.

## What Did Not Work
- A first approach to keep `max_tokens` fixed at 300 while requesting 5,000-10,000 words was not viable because responses would be structurally truncated before meeting the requested day-level summary depth.
- A first approach to place all grouped day documents into one `daily_summary` submission still exceeded provider context limits on large datasets (e.g., ~2.28M tokens), so chunked day execution was required.

## Validation Notes
- Ran workspace lint and test commands after implementing the pipeline and prompt changes.
