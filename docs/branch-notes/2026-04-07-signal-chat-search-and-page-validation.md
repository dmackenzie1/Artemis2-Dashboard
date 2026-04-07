# 2026-04-07 - Signal Chat search and page validation

## Summary
- Revalidated Signal Chat page submit behavior for both ranked utterance search and chat synthesis paths.
- Updated Signal Chat submit flow to clear stale answer/evidence state before each request and after request failures.
- Added frontend unit coverage for the Signal Chat page to verify:
  - successful submit renders answer + evidence payloads,
  - failed submit displays the expected user-facing error message.
- Added `jsdom` as a frontend dev dependency to support DOM-based component tests in Vitest.

## What Did Not Work
- Initial test mocking approach (`vi.mock` referencing top-level `const vi.fn()`) failed due to Vitest mock hoisting (`Cannot access 'searchUtterancesMock' before initialization`).
- Resolved by switching to `vi.hoisted(...)` for creating mocks before module factory evaluation.

## Validation
- `npm run lint`
- `npm run test`
