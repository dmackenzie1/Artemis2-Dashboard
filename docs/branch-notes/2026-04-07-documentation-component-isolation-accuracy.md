# 2026-04-07 - Documentation component-isolation accuracy

## Summary
- Updated `docker/client/ARCHITECTURE.md` flow and file-map language so Overview dashboard panel ownership is explicit: each panel owns its own API calls, results, loading/error state, and polling lifecycle.
- Updated `docker/client/README.md` scope wording to remove stale “page-level state orchestration” phrasing and document parent-level refresh notification responsibilities.
- Updated top-level `README.md` with a dedicated dashboard component ownership contract so cross-repo readers see the same architecture expectation.
- Added a matching `CHANGELOG.md` unreleased docs entry with an explicit intent clause for future maintainers.

## What Did Not Work
- No failed implementation attempts in this task.

## Validation
- `npm run lint`
- `npm run test`
