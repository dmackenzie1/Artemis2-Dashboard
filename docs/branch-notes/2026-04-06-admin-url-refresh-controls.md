# 2026-04-06 - Admin URL refresh controls

## Summary
- Added a client API helper for `POST /api/pipeline/run` so admin workflows can trigger an on-demand pipeline cycle from the UI.
- Added dashboard controller/page refresh wiring so an admin action can force immediate reruns of currently displayed dashboard queries instead of waiting for the 5-minute poll.
- Added a hidden admin-only top-right refresh button that is shown when the URL includes `?admin=true`.
- Added an admin-only failed-widget hint message on the dashboard clarifying immediate/manual retry versus the normal 5-minute automatic retry cadence.
- Added matching changelog entry under `## [Unreleased]` with explicit operator intent.

## What Did Not Work
- Tried to add a screenshot via the dedicated browser container flow, but that tool is not available in this environment, so no UI screenshot artifact was captured in this branch.

## Validation
- `npm run lint`
- `npm run test`
