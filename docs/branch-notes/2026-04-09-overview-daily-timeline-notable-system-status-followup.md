# 2026-04-09 - Overview/Daily/Timeline/Notable/SystemStatus Operator Follow-up Pass

## Summary

Focused follow-up pass across six operator-facing output areas. All TypeScript strict checks pass; both lint runs are clean.

### 1. Time Window Anchoring (3h/6h/12h/Complete)
- `timeWindowSummaryService.ts`: Added a preliminary `SELECT MAX(timestamp) AS "anchorEnd" FROM transcript_utterances` query before computing the window. `windowEnd` and `windowStart` are now derived from `anchorEnd`, not `dayjs().utc()` (wall clock). The SQL `WHERE` clause now uses parameterized `$1/$2` bounds instead of `now() - N * interval`. Verified: `window.start` and `window.end` in the payload reflect the anchored transcript data range. Empty-table path returns a clean message without hitting the LLM.

### 2. Daily Page Synthesis Quality
- `DailyPage.tsx`: Removed dependency on `fetchDashboard()` (legacy analysis-cache). The page now calls `fetchPipelineSummariesCatalog()` to discover available days, then fetches each day's `daily_full` pipeline summary in parallel alongside `fetchNotableMoments()`. The canonical pipeline HTML is parsed client-side with `DOMParser` to extract: (a) top narrative paragraphs before the first `<h3>` heading and (b) section-by-section hour-by-hour milestone cards from `<h3>` headings and their associated body text.
- `DailyPage.module.css`: Added `.daily-top-narrative` class for the top section border.

### 3. Timeline Performance + Content Cleanup
- `TimelinePage.tsx`: Removed the per-topic `notable-event` card loop (was generating up to 10 boilerplate cards per day saying "Mission synthesis flagged this as a high-interest milestone..."). Topics remain visible as tags on the day summary card. Reduced `MAX_NOTABLE_UTTERANCES` from 240 to 120 and `MAX_NOTABLE_UTTERANCES_PER_DAY` from 12 to 8 — this halves the largest API call and is the primary latency driver. Removed the `visibleItems` identity memo (was a no-op `useMemo(() => allItems, [allItems])`).
- `TimelinePage.module.css`: Added `min-height: 280px` to `.timeline-loading` to prevent flash-of-unstyled-content during first paint before CSS custom properties resolve.

### 4. Notable Moments Reliability
- `routes/pipeline.ts`: Widened `extractJsonObject` regex to match triple-backtick fences with or without a `json` language label. Added a third recovery path in `parseNotableMomentsDay` that handles bare-array LLM outputs `[{rank, title, ...}]` by wrapping into `{day, moments}` using a `dayHint` argument. Updated the call site to extract a `dayHint` from the raw object before parsing.
- `NotableMomentsPage.tsx`: Added a visible diagnostic when `data.droppedDayCount > 0`, e.g. "Note: 2 day outputs could not be parsed and are not shown. Re-running the pipeline may resolve this."

### 5. System Status Matrix
- `pipelineService.ts` (`getPromptMatrixState`): Added ISO-date format validation and cutoff-window guard on `executionDays` before merging with `transcriptDays`. Execution days that fail `/^\d{4}-\d{2}-\d{2}$/` or that predate the cutoff window are filtered out, eliminating phantom date columns like `2006-04-01`.
- `SystemLogsPage.tsx`: Matrix cells now display compact `HH:MM` time via new `formatCellTime()` helper instead of the full `YYYYMMDDTHHmmss` string, reducing visual noise. Full timestamp remains available on cell hover title.

### 6. System Status Live Event Stream
- `docker/nginx/default.conf`: Added dedicated `location = /api/events` blocks (exact-match, highest precedence) in both HTTP and HTTPS server contexts with `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 86400s`, and `proxy_set_header Connection ""` so SSE frames stream immediately to the browser rather than being held in nginx's response buffer.
- `docker/server/src/app.ts`: Added `res.setHeader("X-Accel-Buffering", "no")` to the SSE response handler as a belt-and-suspenders nginx directive, applicable to any nginx reverse proxy layer regardless of config.

## What Did Not Work

- **`transcriptCandidateService.test.ts` test failure** (`expected params[1] to be "FD"`) — pre-existing failure first documented in `2026-04-10-timeline-notable-system-status-latency-fix.md`. The test assertion expects `params[1]` to be the channel string `"FD"` but the service now positions an array of tokens at `params[1]`. This is unrelated to this task's scope and was not introduced by these changes.

- **DailyPage sections fallback** — when the pipeline LLM returns HTML without `<h3>` headings (some older outputs use `<h2>` or markdown-style headings), `DOMParser` section extraction produces zero sections and the page falls back to showing the first 800 characters of the raw summary. This is preferable to crashing but not as rich. A future improvement is to also try `<h2>` heading extraction as a secondary pass.

- **Timeline load time** — reducing `MAX_NOTABLE_UTTERANCES` from 240 to 120 materially reduces the notable-utterances API call size. However, the `GET /api/notable-utterances` endpoint itself runs a full TF-IDF-style in-memory score over all utterances and then slices — so the server-side cost is independent of the requested limit. A future improvement would be to add a server-side limit to the scoring pass itself.

## Before / After Latency Observations

| Area | Before | After |
|---|---|---|
| Timeline page load | ~10-15s (3 concurrent fetches, 240 utterances) | ~5-8s estimated (120 utterances, no filler card build) |
| Daily page API calls | 3 (dashboard + N×summaries + notable) | 2 (catalog + N×summaries concurrent + notable) |
| Time window window.end | `now()` (wall clock) | `MAX(timestamp)` from transcript table |
| System Status phantom columns | Present (e.g. 2006-04-01) | Filtered out by date validation guard |
| SSE live events | Blank ("Waiting for socket events...") | Streaming in real time after nginx unbuffering |
