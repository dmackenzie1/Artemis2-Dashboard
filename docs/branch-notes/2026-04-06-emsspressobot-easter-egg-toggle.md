# 2026-04-06 — EMSSpressoBot easter egg toggle

## Summary
- Added a topbar coffee-cup button that toggles EMSSpressoBot on and off from the frontend shell.
- Implemented a reusable frontend utility (`installEmsspressobot`) that encapsulates the provided overlay script behavior and exposes `remove`, `say`, `dodge`, and `home` controls.
- Styled the coffee-cup control to match existing topbar pill/button chrome while keeping the feature lightweight and optional.

## What Did Not Work
- No failed implementation attempts in this pass.

## Validation
- Ran project lint and test commands from repository root after integrating the new frontend utility and topbar toggle.
