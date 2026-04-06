# 2026-04-06 – Timeline notable milestones and reference cleanup

## Summary
- Removed per-hour timeline summary cards from the Timeline page so operators are not forced through redundant “Hourly Summary” entries.
- Updated milestone copy from generic “topic highlight” language to “Notable Milestone” phrasing with clearer mission/public-interest framing.
- Added stronger utterance provenance metadata on Timeline cards (reference id, UTC timestamp, source filename, and score) to support manual cross-reference back into transcript tooling.
- Updated the page subtitle and filter button text to better reflect milestone-oriented scanning.

## What Did Not Work
- Attempted to capture a visual screenshot via the requested browser-container workflow, but this run environment does not expose the `browser_container` tool.

## Validation
- `npm run lint`
- `npm run test`
