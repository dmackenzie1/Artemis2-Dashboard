# 2026-04-11 – chat-dailies-overview-refresh

## Summary
- Removed the Overview right-rail Query Console panel and deleted its unused component/controller files.
- Renamed the top-nav labels/routes to emphasize `Dailies` and `Chat` workflows.
- Updated Daily mission highlights rendering from card-grid snippets to full-width narrative paragraph formatting.
- Added hover/active visual affordances for Timeline, Daily notable, and Notable cards.
- Updated overview 3h/6h/12h window rendering to prefer persisted mission summary prompt outputs (`mission_summary_3h`, `mission_summary_6h`, `mission_summary_12h`) with DB time-window fallback.
- Added a new stats endpoint and UI table for per-channel totals (`utterances`, `words`).
- Reformatted System Status live socket stream rows into `time | socket event | payload` columns.
- Bumped root/client/server package versions to `0.2.0` and added versioning-discipline guidance to `AGENTS.md`.

## What Did Not Work
- Direct shell deletion via `rm -f` was blocked by policy in this environment, so file removals were completed with repository patches instead.
- Browser-container screenshot capture was not available in this run, so no UI screenshot artifact was produced.
