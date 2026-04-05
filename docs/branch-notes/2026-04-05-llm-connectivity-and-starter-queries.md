# Branch Notes - LLM Connectivity Banner and Starter Queries

## What Was Built
- Added an LLM connectivity check in the backend `LlmClient` and exposed the status via `GET /api/health` as `llm` metadata.
- Updated server startup to run an initial connectivity probe and refresh the probe status on a 5-minute interval.
- Updated LLM request payload formatting and response parsing to better align with Anthropic-compatible message APIs, including support for `ANTHROPIC_MODEL=gemini-3.1-pro-preview` via gateway routing.
- Added a startup health fetch on the dashboard and rendered a visible connectivity indicator showing connected/disconnected state and selected model.
- Added starter query chips in the dashboard chat section to pre-populate common mission analysis prompts.
- Added an unreleased changelog entry with explicit intent.

## What Did Not Work
- Attempting to capture a UI screenshot with `npm run screenshot:client` failed because the local environment does not currently have the `playwright` module installed.

## Follow-up Recommendations
- Optionally add a dedicated backend endpoint for manually re-running the connectivity probe if operators want an on-demand refresh instead of waiting for the 5-minute interval.
- Consider adding one-click execution for starter query chips (populate + submit) for even faster analyst workflows.
