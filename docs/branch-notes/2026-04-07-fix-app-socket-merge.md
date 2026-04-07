# 2026-04-07 - fix App.tsx socket merge regression

## Summary
- Repaired `docker/client/src/App.tsx` after a bad merge by removing orphaned health/reconnect/socket-refresh fragments that referenced missing state and imports.
- Restored the app shell to the intended topbar + routes behavior without disconnected reconnect controls.
- Verified linting and tests pass from the repository root workspace scripts.

## What Did Not Work
- I first considered preserving the socket-driven `llm.connectivity.changed` handler in `App.tsx`, but the merge had already removed the related health/reconnect UI and state. Keeping only that fragment still left broken references, so the reliable fix was to remove the orphaned logic entirely.
