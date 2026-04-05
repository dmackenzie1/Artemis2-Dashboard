# 2026-04-05 — LLM pane routing, cache lookup, and preview visibility

## Summary
- Added LLM request metadata (`componentId`, `requestId`) so queued calls are traceable per pane/component and response logs can be correlated reliably.
- Improved response text extraction in the LLM client to handle provider payload variants where `content` arrives as nested arrays/objects without explicit `type` fields.
- Added prompt execution cache metadata in the database (`component_id`, `cache_key`, `cache_hit`) and cache lookup logic in the pipeline so identical prompt+context submissions can return cached outputs.
- Expanded pipeline dashboard payload to include `componentId`, `cacheHit`, `submittedPreview`, and `outputPreview` fields.
- Updated dashboard panels to display response/submission previews and adjusted status messaging so successful-but-empty outputs are surfaced explicitly instead of appearing as unresolved "building" states.
- Added a client-side event log when pane-level LLM responses transition to `success`, including preview and cache-hit state.

## What Did Not Work
- Attempted to capture a UI screenshot via `npm run screenshot:client`, but Playwright Chromium is not installed in this environment, so no screenshot artifact was produced.
