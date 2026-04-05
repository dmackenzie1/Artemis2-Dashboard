# 2026-04-05 - LLM debug prompt artifacts

## Summary
- Added an `LLM_DEBUG_PROMPTS_DIR` server env setting (default `/tmp/llm-prompts`) and wired it into `LlmClient` startup.
- Updated `LlmClient.generateText` to persist one outgoing artifact (system + user prompt) and one incoming artifact (response/error payload) for each request.
- Added a temporary marker file `README-TODO-DELETE-ME.txt` in the debug directory to make cleanup expectations explicit after debugging.
- Added unit coverage that verifies artifact files are emitted and sanitized naming works for request/component identifiers.

## What Did Not Work
- Initially considered adding prompt artifact writes in the frontend container, but LLM requests are executed by the backend service in this architecture, so frontend-only file writes would not capture provider-bound prompt/response payloads.
