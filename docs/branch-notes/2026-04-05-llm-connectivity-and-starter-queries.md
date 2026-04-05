# Branch Notes - LLM Connectivity Banner and Starter Queries

## What Was Built
- Added an LLM connectivity check in the backend `LlmClient` and exposed the status via `GET /api/health` as `llm` metadata.
- Updated server startup to run an initial connectivity probe and refresh the probe status on a 5-minute interval.
- Updated LLM request payload formatting to support both Anthropic-compatible message APIs and OpenAI-compatible `/v1/chat/completions` gateways, including CAIO dev routing with `ANTHROPIC_MODEL=gemini-3.1-pro-preview`.
- Expanded LLM response parsing to support OpenAI-compatible `choices[0].message.content` payloads so chat/completions responses render in the dashboard.
- Added a root-level `.env.settings` template with non-secret CAIO/OpenAI-compatible defaults (including production gateway path and model) to simplify local setup without sharing API keys.
- Added a startup health fetch on the dashboard and rendered a visible connectivity indicator showing connected/disconnected state.
- Updated the dashboard LLM connectivity banner to show only `Connected` on success (without exposing model name in the browser UI).
- Added a startup health fetch on the dashboard and rendered a visible connectivity indicator showing connected/disconnected state and selected model.
- Added starter query chips in the dashboard chat section to pre-populate common mission analysis prompts.
- Added an unreleased changelog entry with explicit intent.

## What Did Not Work
- Using host-only gateway URLs (without `/v1/chat/completions`) returned `405 Method Not Allowed` during connectivity checks.
- Attempting to capture a UI screenshot with `npm run screenshot:client` failed because the local environment does not currently have the `playwright` module installed.
- Attempting to edit branch notes with an inline Python script failed due to a string-quoting error; switching to `apply_patch` resolved it.

## Follow-up Recommendations
- Optionally add a dedicated backend endpoint for manually re-running the connectivity probe if operators want an on-demand refresh instead of waiting for the 5-minute interval.
- Consider adding one-click execution for starter query chips (populate + submit) for even faster analyst workflows.
