# 2026-04-05 — UI merge-conflict hardening for pane-level LLM events

## Summary
- Refactored pane-level "LLM response received" event logging out of `DashboardPage` and into `MissionOverviewPanel` / `DailySummaryPanel`.
- Kept pane-specific logging behavior (`paneId`, `promptKey`, `cacheHit`, `preview`) while reducing shared page-level state churn.
- This lowers rebase/merge pressure on `DashboardPage.tsx`, which is a frequent hotspot for mission-layout updates.

## What Did Not Work
- Attempted to refresh from `main` with `git fetch origin main`, but no `origin` remote is configured in this environment, so an upstream refresh/rebase could not be executed locally.
