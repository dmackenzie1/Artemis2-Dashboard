# 2026-04-05 - LLM submitted context visibility and dashboard table

## Summary
- Added persistent storage for prompt execution submitted text payloads in the backend prompt execution entity.
- Updated the prompt pipeline to build one formatted JSON submission payload per prompt run, store it, send that exact text to the LLM, and return it in dashboard API responses.
- Updated dashboard UX to:
  - show submitted context text under Mission Overview and Last 24 Hours,
  - replace circular stat cards with a plain stats table,
  - remove the Prompt Workflow card section and replace it with a compact LLM Query Window status table.

## What Did Not Work
- Attempted to capture a UI screenshot using a browser_container workflow, but this environment does not expose the browser_container tool, so no screenshot artifact could be produced in this run.
