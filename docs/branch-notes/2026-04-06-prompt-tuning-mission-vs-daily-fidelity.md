# 2026-04-06 - prompt tuning mission vs daily fidelity

## Summary
- Updated `mission_summary` prompt instructions to focus on mission-level meaning, cross-day themes, and high-signal utterances while expanding target output length to 500-1,000 words.
- Updated `daily_summary` prompt instructions so final daily synthesis targets 500-1,000 words and explicitly calls for timeline progression, hourly callouts, anomalies, open watch terms, and best utterances.
- Updated `recent_changes` prompt instructions (Last 24 Hours surface) to mirror high-fidelity daily-review expectations with timeline deltas, hourly callouts, anomalies, open terms, and operator watch-outs in a 500-1,000 word format.

## What Did Not Work
- Did not keep the prior 5,000-10,000 word daily final-synthesis target because it produced overly long outputs that were harder to scan quickly in operator workflows.
