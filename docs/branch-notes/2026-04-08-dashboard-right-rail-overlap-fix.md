# 2026-04-08 - Dashboard right-rail overlap fix

## Summary
- Updated the Overview dashboard grid to use a dedicated right-side rail container.
- Moved `Transcript Metrics` and `Query Console` into that right rail so they stack predictably.
- Resized the top-level grid so the left pane remains the dominant full-height primary column.

## What Did Not Work
- No failed implementation attempts occurred during this change; the first layout refactor resolved the overlap behavior.

## Validation
- Ran lint and test suites from the repo root.
