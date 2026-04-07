# 2026-04-07 – Remove topbar LLM disconnected/reconnect controls

## What changed
- Removed the topbar LLM connectivity badge and the `Reconnect LLM` action from `docker/client/src/App.tsx`.
- Deleted now-unused reconnect/health polling state and handlers from the app shell component so topbar behavior remains focused on navigation and existing utility controls.
- Removed unused topbar reconnect/status styles from `docker/client/src/App.module.css`.

## Why
- Operators requested the top-level disconnected/reconnect UI be removed to reduce topbar clutter.

## What Did Not Work
- N/A. No discarded implementation paths were required for this change.
