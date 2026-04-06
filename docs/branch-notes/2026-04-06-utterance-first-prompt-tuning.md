# 2026-04-06 - Utterance-first prompt tuning across query + summary flows

## Summary
- Updated prompt templates so query aggregation, day extraction, mission summary, daily summary, recent-changes summary, rolling-window summary, topic expansion, and chat/system guidance all explicitly require notable or memorable utterance callouts.
- Kept existing summary/synthesis expectations intact while adding stronger instructions to connect highlighted utterances into narrative/story progression where possible.
- Added an Unreleased changelog entry documenting this prompt-behavior adjustment.

## What Did Not Work
- An initial thought was to add new JSON fields for explicit utterance arrays in `time_window_summary.txt`, but this was not implemented to avoid breaking existing response parsing contracts that currently expect only `summary` and `highlights`.

## Validation Notes
- Prompt file updates are text-only and do not change runtime TypeScript/Express contracts.
