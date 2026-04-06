# 2026-04-06 — Daily-derived 3h/6h/12h pages

## Summary
- Reworked the 3-hour/6-hour/12-hour pages so each page requests a rolling time window directly from a new backend API (`/api/time-window-summary?hours=x`).
- Added a new server-side `TimeWindowSummaryService` that queries transcript rows from Postgres for the last N hours, builds hour-level context, and sends that scoped payload to the LLM for synthesis.
- Added a dedicated prompt template (`prompts/time_window_summary.txt`) for structured JSON output (`summary` + `highlights`) so frontend rendering stays stable.
- Updated frontend time-window pages to show `LoadingIndicator` with “Waiting for results…” while the API + LLM call is running.
- Updated the Unreleased changelog entry intent to reflect DB-backed rolling-window behavior.

## What Did Not Work
- The previous implementation grouped cached `/api/dashboard` daily hourly output and did not satisfy the requirement to query from “now minus X hours” with a fresh LLM pass.
