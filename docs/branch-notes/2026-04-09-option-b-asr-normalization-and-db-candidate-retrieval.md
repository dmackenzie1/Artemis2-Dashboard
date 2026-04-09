# 2026-04-09 — Option B ASR normalization and DB candidate retrieval

## Summary
- Added a new editable ASR correction dictionary artifact to preserve recurring Artemis jargon/callsign/lunar-term misspelling mappings in one place.
- Updated tokenizer behavior to apply correction/normalization rules for both query and utterance tokenization before stop-word removal/deduplication.
- Introduced Postgres-backed transcript candidate retrieval using token-array overlap and optional channel filtering to avoid full-corpus per-query scans in app memory.
- Added startup DDL guards that create transcript retrieval indexes (`GIN(tokens)` and lowercased channel index) when DB mode is enabled.
- Raised `/api/search/utterances` max limit to 80 and aligned retrieval clamp behavior accordingly.
- Added tokenizer tests to verify alias normalization and tactical ID formatting.
- Added an operator-facing fallback prompt artifact documenting intent/scope for replaying this work on a clean branch if needed.

## What Did Not Work
- A first-pass plan to keep all utterances in memory while only changing scoring was rejected because it does not solve 1M+ utterance memory pressure at a 4 GB runtime limit.
- Running backend tests after a prior local build initially doubled Vitest test discovery because compiled `dist` test files were also picked up; constrained backend test script to `vitest run src` to keep execution scoped to source tests.

## Operational notes
- Re-ingestion is still required to regenerate persisted utterance tokens using the new correction dictionary path.
- Ground-truth transcript `text` remains unchanged; only token representations are normalized for retrieval.
