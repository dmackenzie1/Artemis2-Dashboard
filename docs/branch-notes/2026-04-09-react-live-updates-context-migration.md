# 2026-04-09 — React live updates context migration

## Summary
- Replaced client-side DOM `CustomEvent` live-update fanout with a React `LiveUpdatesProvider` + `useLiveUpdates` hook so SSE events flow through React state/context instead of `window.dispatchEvent`.
- Centralized live event buffering and refresh invalidation state (`globalRefreshVersion`, `adminRefreshVersion`, `lastAdminRefreshAt`) inside the provider.
- Migrated app/page consumers (`App`, `DashboardPage`, `DailyPage`, `NotableMomentsPage`, `SystemLogsPage`, `TimelinePage`, `WindowedDailyPage`) off window event listeners to context-driven subscriptions.
- Kept existing feature behavior (auto refresh triggers, admin refresh signaling, System Status live event feed) while removing manual add/remove listener wiring.

## What Did Not Work
- Initial patch attempt against `TimelinePage.tsx` failed due to stale patch context while editing imports/effect blocks; reapplied with a narrower hunk target and completed the migration cleanly.

## Validation Notes
- Workspace TypeScript lint and Vitest suites pass for backend and client after the migration.
- No remaining references to `global-data-refresh-requested`, `dashboard-admin-refresh-requested`, DOM live-event broadcast helpers, or `subscribeToBroadcastLiveUpdates` remain in `docker/client/src`.
