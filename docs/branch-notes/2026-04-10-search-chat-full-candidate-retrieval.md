# 2026-04-10 — Search/chat full candidate retrieval before result clamping

## Summary
- Removed `candidateLimit: 2000` from `AnalysisService.searchUtterances(...)` and `AnalysisService.chat(...)` so DB-backed candidate retrieval can evaluate all matching utterances before ranking.
- Updated transcript candidate SQL limiting to apply only when a caller explicitly passes `candidateLimit`; default behavior is now uncapped for search/chat.
- Updated retrieval clamps/defaults to align with operator-facing expectations: default search limit is now 20 with a max clamp of 40 after deterministic score sorting.
- Removed fixed-count chat evidence slicing (`-40`, `0..40`, `0..12`) and replaced it with deterministic token/character-budget packing from the ordered evidence set.

## What Did Not Work
- Initial idea: return the full ranked evidence set directly into the chat prompt with no budgeting.
- Why it failed: this would exceed practical model prompt budgets on high-volume days and create unstable latency/failure risk.
- Resolution: preserve deterministic ordering and include as much evidence as fits a computed prompt character budget without random or stride sampling.

## Validation
- Ran lint and test suites after code updates.
