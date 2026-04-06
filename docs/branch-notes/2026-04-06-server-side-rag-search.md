# 2026-04-06 - Server-side RAG utterance search

## Summary
- Added a server-side utterance search index in `AnalysisService` that tokenizes transcript text, builds an inverted token index at ingest time, and returns ranked utterance evidence from backend-only scoring.
- Added a dedicated server tokenizer module (`tokenizeQuery`/`tokenizeUtterance`) so tokenization is explicit, reusable, and test-covered instead of implicit inline logic.
- Added `GET /api/search/utterances?q=...&limit=...` so operators/tools can directly retrieve ranked utterances from the server without client-side tokenization.
- Updated `POST /api/chat` to accept `mode` (`rag` or `all`), retrieve server-side context, and send the selected evidence plus the user question to the LLM for final answer synthesis.
- Added a dedicated `/rag-search` page route in the main nav (while keeping `/talkierag` as a compatible alias) so RAG search remains first-class and discoverable.
- Updated TalkieRAG UI/API typing so retrieval evidence cards render backend-ranked snippets (including server score metadata) instead of client-side token overlap ranking.
- Added test coverage for RAG search ranking and chat mode behavior in `analysisService.test.ts`.
- Added dedicated tokenizer tests in `tokenizer.test.ts`.
- Replaced custom token split logic with the external `natural` `WordTokenizer` package and kept a thin server wrapper for normalization + stop-word filtering.
- Added `/chat` as the new top-nav entry point for this workflow while preserving `/rag-search` and `/talkierag` route aliases.

## What Did Not Work
- Initial test wiring used an incorrect relative prompts path (`../../prompts`), which resolved to `docker/prompts` and caused `ENOENT` for `chat_system.txt`; fixed by resolving `../../../prompts` from `docker/server/src`.

## Validation
- Ran workspace lint and tests successfully after implementing server-side search/chat changes.
