# 2026-04-05 - Screenshot fallback executable path support

## Summary
- Updated `scripts/capture-screenshot.js` to support `--browser-path` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` so screenshot capture can use an already-installed Chromium/Chrome executable.
- Added auto-detection of common system browser paths before falling back to Playwright-managed binaries.
- Improved missing-browser error guidance with concrete recovery commands.
- Updated `README.md` screenshot documentation with fallback usage examples.

## What Did Not Work
- This environment still has no local Chromium/Chrome executable in standard paths and blocks Playwright browser downloads, so screenshot creation could not be completed. The new CLI guidance path was validated and now prints fallback instructions when browser startup fails.
