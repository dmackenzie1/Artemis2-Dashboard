# 2026-04-06 — TalkieRAG Removal, Readability Pass, Timeline Controls Cleanup, and LLM Reconnect UX

## Summary
- Removed the dedicated TalkieRAG page from the top-level navigation and routes.
- Added a compatibility redirect so old `/talkierag` links route to `/`.
- Removed the Timeline “Notable Milestones Only” toggle and its filtering state.
- Increased shared text contrast for timeline headers/subtitles/microcopy to resolve faded/hidden copy reports.
- Added a topbar “Reconnect LLM” action that retries health and triggers a pipeline refresh when disconnected.
- Updated prompt persona wording from “TalkyBot transcript review analyst” to “transcript data analyst” in core prompt templates.
- Refreshed dependencies and lockfile with `npm install`.

## What Did Not Work
- Attempted to provide a browser-container screenshot, but no browser_container tool is available in this environment.

## Validation
- Ran workspace lint and test scripts after updates.
