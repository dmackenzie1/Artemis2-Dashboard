# 2026-04-09 - Channel-priority query evidence focus

## Summary
- Updated transcript retrieval scoring to prioritize crew-loop channels (OE/XPL/SpaceOE patterns) and retain a secondary boost for flight coordination loops (Flight Director/ISS/MER/manager families).
- Updated query/chat prompt instructions to treat timestamp/date + channel + transcript text as the primary evidence tuple, with duration/language/translated/filename metadata treated as optional-only.
- Updated README guidance so maintainers have a clear contract for channel-aware evidence handling in transcript search/synthesis behavior.
- Reduced RAG chat prompt payload metadata to the fields required for evidence-grounded answering (timestamp/day/channel/text/score).

## Operator intent captured
- Channel identity should remain explicit in query outputs so loop-level context is preserved.
- Crew channels (OE1/OE2/XPL/SpaceOE families) are elevated while still preserving notable events from flight-director and manager loops.
- Search and synthesis should focus on the fields that matter most operationally: time, text, and channel.

## What Did Not Work
- Initially considered removing filename/source from API responses entirely, but this would have introduced avoidable client contract churn in timeline/signal chat views; kept response shape stable while narrowing prompt evidence payloads instead.

## Validation
- Added retrieval unit coverage verifying crew-loop channel prioritization when text relevance is otherwise equivalent.
