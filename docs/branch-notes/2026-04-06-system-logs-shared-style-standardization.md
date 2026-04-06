# 2026-04-06 — System Logs shared style standardization

## Summary
- Switched `SystemLogsPage` to reuse shared `timeline-page`, `timeline-controls`, and `timeline-control-button` classes instead of page-specific shell/control styling.
- Replaced custom list/viewer wrapper styles with shared `panel` containers so System Logs matches the same card treatment used elsewhere.
- Removed redundant `.system-logs-page`, `.system-logs-controls`, and `.system-logs-viewer` CSS rules now superseded by shared primitives.
- Increased log list and viewer typography sizing and tightened spacing to improve legibility against mission background imagery.

## Validation
- Ran `npm run lint` at repo root (backend + frontend TypeScript checks).
- Ran `npm run test` at repo root (backend + frontend Vitest suites).

## What Did Not Work
- Initial approach retained an extra bespoke outer shell layer while only darkening colors; this still left page behavior divergent from shared page primitives and did not satisfy the requested standardization goal, so it was replaced by shared timeline/panel classes.
