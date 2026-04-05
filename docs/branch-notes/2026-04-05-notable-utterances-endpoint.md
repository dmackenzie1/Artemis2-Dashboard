# 2026-04-05 - Notable utterances endpoint

## Summary
- Added `AnalysisService.getTopNotableUtterances(limit, days)` to rank weekly utterances with a transparent heuristic (rarity, signal terms, channel priority, and recency).
- Added `GET /api/notable-utterances?limit=10&days=7` endpoint with validated/clamped query parameters.
- Added backend tests for ranking behavior and empty/clamped boundary handling.
- Updated README API list and changelog entry.

## What Did Not Work
- Tried to verify output quality against a full 50k-row ingestion snapshot in this environment, but no full dataset fixture is available in-repo for large-scale benchmark replay.
