# 2026-04-09 — Prompt aggregation + chunking fidelity (data-loss fix)

## Summary
- Replaced rolling-window per-hour `slice(0, 12)` sampling with deterministic stratified sampling that always includes early/mid/late positions and then fills remaining slots with anomaly- and rarity-weighted utterances.
- Replaced daily summary chunking from character-length partitioning to tokenizer-driven token budgets.
- Updated daily summary chunk partitioning to split oversized documents by line boundaries only, preserving utterance/record integrity and preventing mid-line truncation.
- Added targeted tests for deterministic representative sampling, anomaly/rare-channel weighting, token-count budgeting utility, and zero mid-line chunk splits.

## What Did Not Work
- Keeping raw character-based chunk splits (the previous approach) continued to permit mid-utterance cuts and context loss, so this was intentionally replaced rather than tuned.
