# 2026-04-09 - DB-first RAG/LLM chat and Signal Chat layout refresh

## Summary
- Reworked transcript chat/search retrieval flow to use DB-seeded utterance memory loaded from `transcript_utterances` rather than CSV rereads in `AnalysisService`.
- Added ingest-time utterance tokenization persistence (`tokens`) during transcript CSV -> DB ingestion so retrieval can reuse pre-tokenized rows.
- Added query-level in-memory caching for search and chat keyed by corpus version.
- Replaced prior `rag|all` chat modes with explicit `rag_chat|llm_chat` modes.
- Implemented `llm_chat` as a day-sharded map-reduce synthesis path capped to ten latest days and per-day context-budgeted submissions.
- Updated Signal Chat UI mode selector labels and changed result layout to full-width stacked Answer above Evidence.
- Updated evidence rendering to use shared structured HTML rendering helper.

## What Did Not Work
- Attempted to use the old `rag|all` mode contract while introducing the new `llm_chat` workflow; this created mismatched client/server payload typing and test expectation drift. Resolved by migrating both API contract and page tests together to `rag_chat|llm_chat`.
- Considered logging tokenization per-row for ingestion observability; rejected because per-row logging is too noisy for 10-20k utterances/day and would bloat logs heavily. Kept step-level logs at file/batch boundaries instead.

## Validation
- `npm run lint`
- `npm run test`
