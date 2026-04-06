# 2026-04-06 – LLM reconnect working-state feedback

## What changed
- Updated the topbar reconnect control in `docker/client/src/App.tsx` to represent explicit recovery phases: `Checking…`, `Reconnecting…`, and `Pipeline running…`.
- Wired the reconnect flow to backend trigger responses so `status: "already-running"` now surfaces as `Pipeline running…` instead of looking like a no-op.
- Kept the disconnected badge and reconnect action split so operators can distinguish static connectivity state from in-flight recovery behavior.

## Why
- Operators asked for clearer "is this working already?" feedback while in disconnected state.
- The backend already exposes in-flight semantics via the pipeline trigger response, so surfacing that state on the button reduces repeated clicks and confusion.

## What Did Not Work
- N/A. No discarded implementation paths were required for this change.
