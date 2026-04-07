# Client Architecture

This document is the implementation map for `docker/client/src`.

## Flow at a glance

1. `main.tsx` boots React Router and mounts `App`.
2. `App.tsx` renders global navigation/topbar + route table.
3. Route pages under `pages/` own route-level state only; they should avoid centralizing dashboard data loading.
4. Dashboard pages compose reusable panel components under `components/dashboard`, and each panel owns its own API calls/results/error state.
5. Parent pages can emit refresh notifications (for example admin refresh events), but panel internals stay isolated.
6. API calls live in `api.ts`; format/log helpers and SSE live-update helpers live in `utils/`.

## File-by-file map (`src/`)

| File | Purpose |
| --- | --- |
| `App.tsx` | App shell/topbar/nav, health polling, admin refresh trigger, route registration. |
| `main.tsx` | React root bootstrap + `BrowserRouter` provider wiring. |
| `api.ts` | Typed HTTP client layer for all backend endpoints consumed by the UI. |
| `api.test.ts` | API helper regression tests (request/response behavior). |
| `app.test.ts` | App shell/routing behavior tests. |
| `styles.module.css` | Global mission-themed layout and component styling classes. |
| `types.d.ts` | TypeScript ambient declarations used by Vite/client compilation. |
| `utils/logging/clientLogger.ts` | Structured client logging facade (info/warn/error). |
| `utils/formatting/renderStructuredText.tsx` | Structured text renderer for multiline LLM output blocks. |
| `utils/live/liveEvents.ts` | EventSource (`/api/events`) subscription helper for server-published invalidation/health events. |
| `pages/DashboardPage.tsx` | Main overview route composing summary/stats/chat/timeline panels and passing only refresh notifications (`refreshToken`) into panel components. |
| `pages/DailyPage.tsx` | Per-day review route parsing prompt payload + daily details display. |
| `pages/TimelinePage.tsx` | Long-form timeline view with mission chronology presentation logic. |
| `pages/NotableMomentsPage.tsx` | Notable moments route parsing daily JSON payload from pipeline output. |
| `pages/SystemLogsPage.tsx` | Operator system-log browser for prompt artifacts/debug files. |
| `pages/TopicPage.tsx` | Topic detail route for `/topics/:title` drill-down content. |
| `pages/dashboard/types.ts` | Dashboard-page-specific view-model typing. |
| `pages/dashboard/dashboardViewModel.ts` | Pure transformation layer from API payloads to dashboard view model. |
| `pages/dashboard/dashboardViewModel.test.ts` | Unit tests for dashboard view-model shaping logic. |
| `pages/dashboard/useDashboardController.ts` | Legacy controller from older centralized dashboard orchestration; retained for historical reference/tests and no longer used by `DashboardPage`. |
| `components/dashboard/types.ts` | Shared dashboard component prop/data contracts. |
| `components/dashboard/promptDisplay.ts` | Prompt status/value helper utilities for pane rendering. |
| `components/dashboard/MissionOverviewPanel.tsx` | Mission summary panel UI. |
| `components/dashboard/DailySummaryPanel.tsx` | Last-24-hours/daily summary panel UI. |
| `components/dashboard/StatsPanel.tsx` | Mission metrics table + daily volume chart panel UI. |
| `components/dashboard/MissionChatPanel.tsx` | Query Console chat interaction panel UI. |
| `components/dashboard/UtterancesTimelinePanel.tsx` | Mission hourly histogram/timeline panel UI. |
| `components/dashboard/primitives/DashboardPanel.tsx` | Shared panel chrome/frame wrapper. |
| `components/dashboard/primitives/StatusBadge.tsx` | Small status chip used in topbar and panels. |
| `components/dashboard/primitives/LoadingIndicator.tsx` | Shared loading placeholder/spinner primitive. |
| `components/dashboard/primitives/PaneStateMessage.tsx` | Shared empty/error/pending message presenter. |
| `components/dashboard/primitives/useComponentIdentity.ts` | Stable component id/uid generation hook for instrumentation/debugging. |
| `assets/backgrounds/background.png` | Dashboard background asset placeholder path for mission imagery. |

## Dashboard isolation contract (April 7, 2026)

- Each Overview panel must own its own request lifecycle (`load*` callback + polling + local loading/error/results state).
- `DashboardPage` must stay focused on layout and cross-panel notifications (`dashboard-admin-refresh-requested` -> `refreshToken`).
- `DashboardPage` also listens for server live-update events and maps them into `refreshToken` bumps so panel ownership remains local.
- Panels may accept `refreshToken` to refetch on parent notification, but should not consume sibling panel data or shared page controllers for API results.

## Dead-code and hygiene notes (April 6, 2026)

- Removed unused `DashboardToolbar` component file; dashboard top controls now live in `App.tsx`.
- Removed unused API helper/types for pipeline stats (`fetchPipelineStats`, `PipelineStatsData`) that had no call sites.
- Removed unused exported `NotableMomentsDay` type from `api.ts`; page-local parser keeps its own local shape.
