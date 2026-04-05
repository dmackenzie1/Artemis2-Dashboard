# 2026-04-05 - Server LLM queue, preview logging, and hourly-summary disablement

## Summary
- Added a serialized LLM request queue in the server `LlmClient` so only one `generateText` call executes at a time across ingestion, chat, and pipeline workflows.
- Added server-side request/response preview logging for LLM traffic with truncation rules (request previews capped to two lines/few hundred characters; response previews capped to three lines/few hundred characters).
- Disabled hourly summary prompt generation in `AnalysisService.ingestAndAnalyze()` so ingest no longer emits hourly-summary LLM prompts.

## What Did Not Work
- None.
