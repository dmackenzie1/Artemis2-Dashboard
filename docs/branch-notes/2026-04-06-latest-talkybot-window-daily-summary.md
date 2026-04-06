# 2026-04-06 - Latest TalkyBot Window uses current daily summary

## Summary
- Updated the dashboard view-model so the **Recent Transcript Review / Latest TalkyBot Window** panel uses the `daily_summary` pipeline prompt output instead of `recent_changes`.
- Added latest-day section extraction logic so multi-day `daily_summary` output only renders the current latest ingested day section in that panel.
- Updated fallback behavior to use the latest ingested day summary from `/api/dashboard` cache when prompt output is missing.
- Added client view-model regression tests for latest-day extraction and latest-day fallback behavior.
- Added changelog entry under **Unreleased** with intent-driven rationale.

## What Did Not Work
- Initial idea of swapping to `daily_summary` without section extraction displayed all day sections and did not match the operator request for the current day only.
