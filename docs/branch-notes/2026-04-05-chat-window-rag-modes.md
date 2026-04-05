# 2026-04-05 - Chat window UX + retrieval mode controls

## Summary
- Reworked the dashboard chat panel into a true chat-style window with message history, multiline input, and explicit `Submit` action.
- Added a visible `thinking` state while requests are in flight.
- Added chat context mode controls (`rag` vs `all`) and surfaced strategy metadata in assistant responses.
- Extended API/server chat plumbing to support mode-aware query execution and return context strategy metadata.

## What Did Not Work
- Attempted to stream true full-dataset context for large transcript sets directly to the model, but this is not token-safe at 50k-100k utterances. Implemented a bounded broad-sweep mode with truncation telemetry instead.

## Validation
- Ran workspace lint and tests after implementation.
