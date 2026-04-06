# 2026-04-06 — ChatMode merge fix

## Summary
- Removed the stale `ChatMode` parameter from `docker/client/src/api.ts` `chat` helper after merge fallout left a reference to an undefined type.
- Confirmed frontend workspace production build now succeeds (`npm run -w frontend build`).

## What Did Not Work
- Keeping the merged `chat(query: string, mode: ChatMode = "rag")` signature failed TypeScript compilation because `ChatMode` was no longer defined in the file.
