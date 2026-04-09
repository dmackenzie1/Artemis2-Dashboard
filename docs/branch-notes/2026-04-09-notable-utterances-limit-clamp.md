# 2026-04-09 - Notable utterances limit clamp

## Summary
- Updated the `/api/notable-utterances` query validation path to accept positive integer `limit` input and clamp values above the server cap to `50`.
- Kept the existing bounded server workload behavior by enforcing the cap before calling `analysisService.getTopNotableUtterances(...)`.
- Returned the normalized `limit` value in the API response so clients can reflect the effective page size.

## What Did Not Work
- Keeping strict `zod` `.max(50)` validation caused repeated `ZodError` exceptions when callers sent `limit` values above 50, which surfaced as noisy "Unhandled API error" log entries.

## Validation
- Ran server lint and tests from the repository root via workspace targeting to confirm the change compiles cleanly and does not regress existing behavior.
