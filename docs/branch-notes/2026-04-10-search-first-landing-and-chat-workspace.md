# 2026-04-10 - Search-first landing and Signal Chat workspace routing/layout refresh

## Summary
- Redirected the app root route from `/` to `/chat` so Search/Chat is the default landing experience.
- Added a direct `/search` route alias that resolves to `/chat`.
- Updated topbar navigation to use explicit selected-state classes for reliable route highlighting.
- Converted Signal Chat to a full-width workspace layout with:
  - two-pane content area (chat log left, evidence right)
  - bottom anchored query composer
  - scrollable chat/evidence panes for post-mission research workflows.

## Validation
- Ran TypeScript lint checks and test suites from the repository root (`npm run lint`, `npm run test`).
- Verified client build output (`npm run build -w client`).

## What Did Not Work
- Screenshot capture via the requested browser-container workflow was not possible in this environment because the `browser_container` tool is unavailable in this session.
