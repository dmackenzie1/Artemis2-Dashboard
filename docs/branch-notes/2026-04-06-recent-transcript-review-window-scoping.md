# 2026-04-06 — Recent Transcript Review window scoping

## What changed
- Updated pipeline prompt-submission logic so `recent_changes` no longer sends the entire `source_files` corpus to the model.
- `recent_changes` now submits only the latest two grouped day bundles, labeled as a rolling 24-hour window compared to a prior baseline.
- Kept full-source behavior for other prompt keys unchanged.

## Why
- The Recent Transcript Review panel was repeatedly failing with context-window overflow errors because the request payload included multi-day raw source documents.
- Operator intent is specifically a last-24-hours-style delta view, so trimming to the most recent window keeps the payload aligned and token-safe.

## What Did Not Work
- Relying on fallback model routing alone did not recover failures because all configured fallback groups were still fed the same oversized payload and exceeded max input tokens.

## Follow-up
- Consider adding a hard token-budget estimator before model submission so oversized prompt payloads are pre-trimmed with deterministic logging.
