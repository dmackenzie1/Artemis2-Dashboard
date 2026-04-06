# 2026-04-06 — Topbar window removal and timeline contrast

## Summary
- Removed the topbar 3 Hour / 6 Hour / 12 Hour navigation actions and replaced legacy routes with redirects to Daily.
- Deleted the now-obsolete dedicated 3-hour, 6-hour, and 12-hour page components.
- Updated the transcript histogram panel by removing the "Hourly" title wording and dropping the footer coverage sentence.
- Added histogram hour coverage into Transcript Metrics as a dedicated `Hours` row.
- Strengthened shared timeline-header visual contrast to improve readability on Timeline, Chat, and System Logs page headings.

## Validation
- Ran `npm run lint`.
- Ran `npm run test` (backend test suite fails in current workspace due missing `wink-tokenizer` module import dependency).
- Ran `npm run test -w frontend`.

## What Did Not Work
- `npm run test` did not complete successfully because backend Vitest suites currently fail to import `wink-tokenizer` from `docker/server/src/lib/tokenizer.ts` in this environment.
