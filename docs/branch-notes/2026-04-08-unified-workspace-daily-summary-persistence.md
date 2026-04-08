# 2026-04-08 - Unified workspace pane, daily summary persistence, and notable/timeline flexibility

## Summary
- Reworked the Overview layout so one double-height "Mission Text Workspace" pane now occupies the previous two long-text regions, with mode selection constrained to `3h`, `6h`, `12h`, and `Complete`.
- Updated the workspace panel logic so windowed modes continue using DB-backed rolling summaries while `Complete` uses mission-level synthesis prompt output/fallback cache.
- Standardized shared scroll-copy styling through shared CSS primitives and removed duplicate panel-local scroll wrappers.
- Added a new `daily_summaries` persistence entity and pipeline upsert logic so each daily summary run replaces/stores per-day summary text plus generated metadata (`generatedAt`, `wordCount`, `utteranceCount`, `sourceDocumentCount`).
- Added configurable notable-moment targeting controls (baseline/min/high-signal/max) and adaptive day targeting for high-signal days.
- Polished Notable Moments presentation by removing stagger transforms, introducing optional rationale visibility, and keeping quote-forward cards.
- Increased timeline quote flexibility by replacing hard fixed per-day quote slicing with adaptive limits.
- Updated architecture docs and changelog entries to reflect the new unified dashboard/text strategy and persistent daily summary workflow.

## What Did Not Work
- No major implementation dead ends occurred; the main adjustment was keeping `Complete` mode in the unified panel by reusing existing mission-summary pipeline dashboard data instead of introducing a new endpoint to avoid redundant API surface area.

## Validation
- `npm run lint`
- `npm run test`
