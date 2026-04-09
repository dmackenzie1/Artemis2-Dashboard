# 2026-04-09 - Daily transcript volume all-days scope

## Summary
- Updated Overview `StatsPanel` to load Daily Transcript Volume without a day-limit query and renamed the section label to `Daily Transcript Volume (All Days)`.
- Updated client API helper/tests so `/api/stats/daily-volume` omits `?days=` by default.
- Updated server daily-volume route/service defaults so an omitted `days` query returns all available day rows (most recent first), while preserving bounded `days` behavior when provided.
- Added changelog entry under `Unreleased` documenting operator-facing intent.

## What Did Not Work
- No failed implementation attempts in this task.
