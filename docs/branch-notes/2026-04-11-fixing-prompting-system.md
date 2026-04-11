# 2026-04-11 – Fixing prompting system (pipeline + schema + prompt content)

## What changed
- Reworked prompt pipeline flow to be day-scoped and operationally legible: AM summary, PM summary, daily final synthesis, notable moments (per day), then a mission summary roll-up.
- Restricted System Status prompt visibility/runnable focus to core summary prompts only.
- Simplified prompt execution persistence by removing unused placeholder fields: `componentId`, `cacheKey`, `cacheHit`, and `finishedAt`.
- Aligned server/client pipeline payload contracts with the simplified prompt execution shape.
- Updated prompt templates to better match current payload modes and required output structure:
  - `daily_summary_am.txt` and `daily_summary_pm.txt` now require structured evidence-first sections (notable moments, hourly highlights, topics, changes, evidence anchors) with timestamp/channel attribution.
  - `daily_summary.txt` now targets `daily-final-from-half-day` mode and requires AM+PM synthesis with explicit day-level sections.
  - `notable_moments.txt` now treats `targetMoments` as optional, accepts `dailySummary` context, and requires timestamp/channel/source precision when available.
- Updated notable moments run payload to include `targetMoments` from runtime config.

## Why
- Operators requested simpler, clearer prompt execution state and less schema/UI noise from non-used metadata.
- Prompt templates needed to reflect the actual pipeline payloads and required report sections so daily outputs are reusable and consistently evidence-grounded.

## What Did Not Work
- No failed implementation attempts in this change set.
