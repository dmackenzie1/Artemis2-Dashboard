# 2026-04-08 - Dashboard bottom-anchored histogram and text fill

## Summary
- Adjusted the Overview dashboard row sizing so the bottom histogram row is content-sized and pinned to the bottom of the viewport area.
- Reduced dashboard viewport height calculations to account for main-content padding so the page uses available vertical space without leaving dead gaps.
- Updated the transcript-activity panel body layout so the histogram content stays bottom-aligned within its card.

## What Did Not Work
- No failed implementation attempts occurred during this change; the first CSS layout pass achieved the requested behavior.

## Validation
- Ran lint and test suites from the repo root.
