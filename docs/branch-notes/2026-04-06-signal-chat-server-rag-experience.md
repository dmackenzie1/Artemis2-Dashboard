# 2026-04-06 - Signal Chat server-side RAG experience

## Summary
- Added a new top-level Chat route (`/chat`) with a dedicated Signal Chat page that includes query entry, mode selection (`rag`/`all`), answer display, and ranked evidence metadata.
- Added server-side tokenizer and retrieval modules so query tokenization, scoring, and ranking are deterministic and CPU-light on the backend.
- Added `GET /api/search/utterances` with Zod query validation and ranked retrieval payload.
- Updated `POST /api/chat` to support mode-aware behavior while preserving existing Overview Query Console integration.
- Expanded tests for retrieval behavior and client API helper behavior.

## What Did Not Work
- Attempted to use broad regex-only token splitting as the tokenizer core, but this did not satisfy the external tokenizer requirement; replaced with a wrapper around `wink-tokenizer` plus stop-word filtering.


## Follow-up Double Check
- Updated Signal Chat evidence panel rendering to use the dedicated ranked search payload (`searchResponse.utterances`) so the UI always reflects server-ranked evidence directly.
- Tightened client chat strategy mode typing from legacy `multi-day | rag | all` to `rag | all` to match current backend contract.

### What Did Not Work (Follow-up)
- Running backend tests failed once with module resolution errors for `wink-tokenizer` until workspace dependencies were reinstalled with `npm install`; reran lint/tests after reinstall and all checks passed.
