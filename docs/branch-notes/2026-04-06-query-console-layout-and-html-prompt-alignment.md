# 2026-04-06 — Query Console layout and HTML prompt alignment

## Summary
- Updated the Overview Query Console layout so the Search action remains visible in empty-state scenarios without requiring panel scrolling.
- Reduced the query textarea height and moved the chat pane to a flex-column layout so the message window takes available space while the form remains anchored and visible.
- Updated assistant message rendering in the Overview Query Console to support HTML-formatted responses.
- Updated Artemis prompt templates to require HTML output (instead of Markdown/plain-text guidance) for prompt flows that produce narrative text.
- Updated chat system prompting in `analysisService` so Signal Chat also requests HTML output fragments.

## Validation
- `npm run lint` ✅
- `npm run test` ⚠️ (backend test suite fails in this environment due missing `wink-tokenizer` package import at runtime)
- `npm run test -w frontend` ✅

## What Did Not Work
- Running the full monorepo test command (`npm run test`) did not complete successfully because backend Vitest suite setup fails before tests execute when `wink-tokenizer` cannot be resolved in this environment.
