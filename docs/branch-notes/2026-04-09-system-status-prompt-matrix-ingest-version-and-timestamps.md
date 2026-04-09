# 2026-04-09 — System Status prompt matrix ingest-version and timestamp hardening

## Summary
- Added `responseDay`, `sentAt`, and `receivedAt` persistence to `prompt_executions`, including startup schema-backfill logic so existing records retain coherent lifecycle timestamps.
- Updated prompt lifecycle event payloads to include canonical sent/received timestamps and response-day fallback behavior.
- Evolved `/api/pipeline/prompt-matrix-state` to include `latestIngestAt` and richer per-cell metadata (`sentAt`, `receivedAt`, `responseDay`) while keeping bounded day windows.
- Updated the System Status matrix UI to show compact UTC second-level timestamps (`YYYYMMDDTHHmmss`) in each active cell and in hover metadata.
- Switched matrix refresh strategy to authoritative API re-fetch on prompt/date/ingest update events (debounced), prioritizing server truth over local client-only patching.

## What Did Not Work
- Initial plan attempted to keep local in-memory matrix patching as the primary source after event arrival; this was susceptible to drift when reconnecting or when day windows rebounded. Replaced with debounced snapshot re-fetch from server state.
- Dataset fingerprint-only strategy was considered, but it created ambiguity for append-heavy ingest histories without a stable ingest-run marker; switched to `latestIngestAt` metadata as the primary synchronization marker.

## Validation Notes
- Matrix now renders second-precision lifecycle timestamps directly under the state symbol for fast operator scanability.
- Prompt-day attribution now prefers explicit `responseDay` when available and falls back to UTC sent/start day.
