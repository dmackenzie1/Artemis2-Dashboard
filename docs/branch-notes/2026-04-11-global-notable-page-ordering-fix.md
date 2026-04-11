# 2026-04-11 — System Status global notable-page ordering fix

## Summary
- Updated System Status prompt-matrix global notable-row mapping to only consider `notable_moments` executions that resolve to the latest mission day in the matrix window, instead of any historical notable execution.
- Added a regression test that verifies `global_notable_page` remains unchecked when only an older-day notable execution exists and the latest mission day has no notable run.

## What Did Not Work
- Using the latest `notable_moments` execution without day scoping marked Global Notable Page as complete even when current-day daily/notable runs had not started.
