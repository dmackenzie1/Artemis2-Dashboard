# 2026-04-08 - Incremental day reingest and summary refresh

## Summary
- Updated the backend pipeline source-document sync flow to return changed document counts plus changed day keys inferred from date-prefixed filenames.
- Updated prompt-definition sync to return changed prompt keys and wired `runPipelineCycle` to pass both source/prompt deltas into prompt execution.
- Updated sequential prompt execution to skip unchanged prompt runs, scope day-based prompts to only changed day groups when possible, and use cached `daily_summaries` content when mission synthesis is requested without a fresh daily run.
- Added regression coverage for day-key filtering so incremental day targeting remains protected.

## What Did Not Work
- A first-pass gating approach that always executed `mission_summary` would still incur avoidable LLM calls on no-change runs, so it was replaced with delta-aware mission prompt gating.

## Validation
- Ran lint and test suites from the repo root.
