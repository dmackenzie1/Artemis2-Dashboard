# 2026-04-10 – Prompt catalog and AM/PM summary standardization

## What changed
- Added a canonical prompt catalog for alias normalization and explicit runnable/priority ordering.
- Added dedicated `daily_summary_am` and `daily_summary_pm` prompt definitions and wired them into pipeline execution.
- Added half-day summary generators and updated System Status prompt labels to match standardized keys.

## Why
- Operator feedback indicated prompt names were difficult to parse and did not clearly communicate pipeline order.
- The daily pipeline now presents a clearer AM/PM/final progression for System Status visibility.

## What Did Not Work
- Could not capture a UI screenshot in this run because the `browser_container` tool was not available in the execution environment.
