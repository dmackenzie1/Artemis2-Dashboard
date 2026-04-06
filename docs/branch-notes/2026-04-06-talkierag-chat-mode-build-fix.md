# 2026-04-06 - TalkieRAG chat mode build fix

## Summary
- Reproduced the frontend TypeScript build failure reported during Docker image build.
- Fixed `docker/client/src/api.ts` chat helper to accept an optional `mode` parameter with a default of `"rag"`.
- Kept request payload shape compatible with current backend `/api/chat` parsing (backend consumes `query`; extra key remains non-breaking).

## Validation
- Ran frontend workspace build to confirm TypeScript and Vite now compile.
- Ran repository lint and test scripts to confirm no regressions.

## What Did Not Work
- Attempting to rely on the previous one-argument `chat(query)` signature while still posting `{ query, mode }` failed TypeScript compilation because `mode` was no longer in scope.
