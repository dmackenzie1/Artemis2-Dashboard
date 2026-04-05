# 2026-04-05 — Remove background binary and add drop placeholder

## Summary
- Removed the committed dashboard background image binary from the client source tree.
- Updated the dashboard CSS background layer to point at `./assets/backgrounds/background.png`.
- Added `docker/client/src/assets/backgrounds/PLACE_BACKGROUND_HERE.txt` so maintainers know exactly where to drop the real background file.

## Validation
- Ran workspace lint and tests from the repository root.

## What Did Not Work
- No failed implementation attempts for this change.
