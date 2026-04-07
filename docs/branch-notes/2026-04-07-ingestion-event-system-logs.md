# 2026-04-07 - Ingestion event entries on System Logs page

## Summary
- Added backend ingestion event artifact writing in `docker/server/src/index.ts` so startup, auto-ingestion, and manual `/api/ingest` runs create timestamped JSON files in `PROMPT_SUBMISSIONS_DIR`.
- Kept the implementation file-based so the existing System Logs API/page can list and open these entries without adding a separate datastore.
- Updated the System Logs page subtitle copy to clarify that ingestion event records now appear alongside prompt submission/request/response files.
- Added an Unreleased changelog entry documenting the feature and intent.

## What Did Not Work
- `npm run test` fails in the frontend workspace because Vitest cannot find the `jsdom` package in this environment (`ERR_MODULE_NOT_FOUND` while starting `SignalChatPage.test.tsx`).

## Validation
- `npm run lint`
- `npm run test`
