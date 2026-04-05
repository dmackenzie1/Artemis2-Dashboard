# Branch Notes - Auto Ingest and Prompt Readiness UX

## What Was Built
- Updated backend startup flow to emit an explicit `Backend is ready` log line and schedule ingestion immediately after listen bind.
- Added startup ingestion orchestration so cached dashboard data is built automatically, and when the transcript DB pipeline is enabled, prompt workflow execution runs immediately after ingestion.
- Updated `/api/ingest` behavior to trigger the DB-backed prompt workflow after ingestion finishes so prompt outputs are persisted without requiring a separate frontend action.
- Removed the manual ingest control from the dashboard UI and switched to automatic polling/refresh of dashboard + pipeline status data.
- Reworked dashboard content cards to default to readiness states (`building`, `querying`, `not ready`) based on prompt execution status until outputs are available.
- Converted the communications histogram to hour buckets aggregated from ingestion stats (non-LLM-derived counts).

## What Did Not Work
- Attempted to capture an updated dashboard screenshot with `npm run screenshot:client`, but no local app was reachable at `http://localhost:8080` in this environment.

## Follow-up Recommendations
- Add a backend startup health endpoint that includes ingestion/prompt-workflow phase so frontend can show exact boot phase text without polling heuristics.
- Consider splitting prompt workflow into a queue worker to isolate long-running LLM calls from API process responsiveness.
