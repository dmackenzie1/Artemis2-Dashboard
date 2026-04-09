# 2026-04-09 — SQL/LLM lifecycle live events and system log stream

## Summary
- Added backend live-update event types for file-level SQL load stages and LLM day lifecycle stages.
- Wired transcript ingestion to emit per-file start/completion callbacks, including SQL completion stats (inserted/deleted/skipped/errors and total utterances in DB).
- Broadcast SQL completion and LLM completion milestones to the client so pages can trigger lightweight, component-owned API re-queries.
- Added a live socket event stream section to System Logs so operators can watch incoming socket/SSE events in real time.
- Centralized app-shell event fanout: every received live event is now client-logged and rebroadcast into DOM custom events.

## What Did Not Work
- Initially tried patching all `index.ts` lifecycle changes in one large diff; patch context failed because the file had shifted. Reworked into smaller targeted patches for startup and manual/auto ingestion sections.

## Validation
- `npm run lint`
- `npm run test`
