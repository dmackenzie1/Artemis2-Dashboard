# 2026-04-05 - LLM queue priority and dashboard panel layout

## Summary
- Added ordered prompt execution in the pipeline so mission overview (`mission_summary`) always runs first and last-24-hours (`daily_summary`) runs second.
- Removed automatic hourly prompt execution by skipping `hourly_summary` in the queue.
- Updated pipeline dashboard payloads to include `errorMessage` for failed prompt runs so the UI can show why an LLM response is missing.
- Reworked dashboard layout to a true two-column mission view with mission chat occupying the right half-column instead of full width.
- Simplified the stats card by removing day-to-day rows and moved utterances-per-hour into a dedicated full-width bottom chart panel.

## What Did Not Work
- Initial render still showed "Not ready" with no troubleshooting detail when LLM calls failed; this was not actionable for operators.
- Fixed by exposing server-side `errorMessage` on prompt rows and surfacing it in the panel fallback text.
