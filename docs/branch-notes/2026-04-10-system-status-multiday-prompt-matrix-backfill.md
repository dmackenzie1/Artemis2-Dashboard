# 2026-04-10 — System Status multiday prompt-matrix backfill

## Summary
- Investigated why System Status showed only the current execution day despite many per-day incoming prompt artifacts in debug logs.
- Updated prompt-matrix hydration to derive execution day coverage from `prompt_executions.submitted_text.dayGroups[].day` when `response_day` is null.
- Kept existing timestamp-derived day fallback for malformed or legacy payloads.
- Added a regression test that verifies a null-`responseDay` execution with multiday `dayGroups` marks each day as received.

## What Did Not Work
- Relying on `response_day` + `sent_at` alone did not work for multiday prompts, because these executions intentionally use one lifecycle row while the underlying LLM fan-out spans many day groups.

## Validation
- Ran workspace lint and test scripts from the repo root.
