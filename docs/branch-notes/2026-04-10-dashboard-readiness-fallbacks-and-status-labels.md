# 2026-04-10 — Dashboard readiness fallbacks and System Status naming cleanup

## Summary
- Added deterministic fallback generation for Overview hourly highlights and top topics in `AnalysisService` so dashboard sections continue to populate even when LLM prompt calls fail or time out.
- Updated pipeline read endpoints (`/api/pipeline/dashboard`, `/api/pipeline/prompt-matrix-state`, and prompt-by-key reads) to sync prompt definitions on demand, so a freshly reset database still shows prompt rows immediately.
- Added operator-friendly prompt labels in the System Status matrix, including:
  - `option_b_db_candidate_retrieval_prompt` -> `Option B DB Candidate Retriever Prompt`
  - `query_console_aggregate` -> `Console Query Aggregate`

## What Did Not Work
- Running the full test suite initially failed because `getPromptMatrixState()` now triggers prompt sync and the existing test stub uses `/tmp/prompts`, which did not exist.
- After handling missing prompt directories, the same test still failed because the mocked entity manager in that unit test does not expose `flush()`.
- Resolved by making prompt-directory sync tolerant of missing directories and by calling `flush()` only when available on the current entity manager.

## Validation
- `npm run lint`
- `npm run test`
