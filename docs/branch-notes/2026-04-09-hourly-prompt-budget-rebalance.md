# 2026-04-09 — Hourly prompt budget rebalance (800k cap + 60/hour + top evidence)

## Summary
- Raised the LLM user prompt hard limit from 500,000 to 800,000 characters.
- Reduced hourly-summary sampling from 120 to 60 utterances per hour.
- Added short per-hour synopsis text and top-10 ranked utterance slices into hourly-summary prompt payloads.
- Updated hourly prompt instructions to treat synopsis/top utterances as primary evidence and full sampled utterances as supplemental context.

## Why
- Startup hourly-summary analysis failed on dense days when the user prompt exceeded 500,000 characters.
- Operators requested denser signal extraction and less bulk transcript payload per hour.
- We need an immediate reliability improvement now, while staging toward fuller phase-3 prompt-structure optimization.

## What Changed
- `docker/server/src/services/llmClient.ts`
  - Increased `defaultMaxUserPromptCharacters` to `800_000`.
- `docker/server/src/services/analysisService.ts`
  - Lowered `hourlyPromptMaxUtterancesPerHour` to `60`.
  - Added `hourlyPromptTopUtterancesPerHour` (`10`).
  - Added helper scoring for hourly prompt utterance prioritization.
  - Added per-hour synopsis generation and top-utterance selection in hourly payload construction.
- `prompts/hourly_summary.txt`
  - Added guidance to prioritize `hourSynopsis` and `topUtterances` evidence.
- `CHANGELOG.md`
  - Added an Unreleased entry with explicit Intent clause.

## What Did Not Work
- No failed implementation attempts in this change set.

## Follow-ups
- Add a strict character-budget preflight for hourly payload assembly with deterministic backoff (reduce per-hour sampled utterances adaptively before dispatch).
- Consider hour-level candidate stratification by channel groups (crew loops vs flight-control loops) to preserve loop context while reducing payload size.
