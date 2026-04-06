# 2026-04-06 - Dashboard background blur alignment

## Summary
- Removed the dashboard-only `backdrop-filter` blur from `.space-panel` so Overview panels no longer soften the shared mission background image.
- Kept the existing global layered background stack unchanged so Daily, Timeline, and Overview now share the same perceived background sharpness profile.

## Validation
- Ran `npm run lint` at repo root.
- Ran `npm run test` at repo root.

## What Did Not Work
- No failed implementation attempts were required for this change.
