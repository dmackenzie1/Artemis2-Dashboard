## Summary
- Switched the dashboard page from two-column mission cards to a single-column operational flow.
- Removed "Submitted Context" blocks from Mission Overview / Last 24 Hours UI while keeping prompt payload persistence in the backend.
- Added backend prompt-execution logging of submitted prompt context so operators can inspect payloads in server logs.
- Added a cached `/api/pipeline/stats` endpoint driven by transcript DB queries (min/max timestamps, totals, and hourly utterance histogram buckets).
- Reworked the Stats panel to consume server stats and render an utterances-per-hour histogram.
- Replaced visible "LLM Connected" text with a compact top-right connectivity status dot.
- Consolidated env templates into `.env.example` and removed `.env.settings`.

## What Did Not Work
- `npm run screenshot:client` was not run because this environment does not provide the requested `browser_container` tool workflow for UI capture in this task context.
