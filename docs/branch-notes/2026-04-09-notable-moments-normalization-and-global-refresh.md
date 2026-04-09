# 2026-04-09 - Notable moments normalization and global refresh wiring

## Summary
- Normalized `/api/pipeline/notable-moments` response payloads server-side so malformed or fenced JSON day entries no longer silently disappear from UI rendering.
- Updated frontend notable moments contracts to consume structured day objects directly instead of reparsing raw day strings in each page.
- Added a `cacheClear=true` URL-query debug path in the app shell that calls server cache-clear once and strips the query param.
- Added app-level live-update fanout (`global-data-refresh-requested`) and wired Daily/Timeline/System Logs/Windowed pages to re-fetch when backend emits data-refresh events.

## What Did Not Work
- First pass considered relying only on existing client-side `JSON.parse` in Timeline/Notable pages. That approach could still drop entries whenever LLM output included markdown fences or extra prose around JSON, so it would not reliably recover all days.
- First pass considered a hard full-page reload on every live event. That was rejected as too disruptive and likely to cause unnecessary navigation churn; event fanout plus targeted re-fetch is safer.

## Validation
- `npm run lint`
- `npm run test`
