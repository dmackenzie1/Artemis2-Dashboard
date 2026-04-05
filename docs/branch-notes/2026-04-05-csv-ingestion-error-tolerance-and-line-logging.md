# 2026-04-05 - CSV ingestion error tolerance and line-level logging

## Summary
- Hardened transcript CSV ingestion to continue processing when parser-level row errors are encountered.
- Added line-aware warning logs for malformed parser rows and invalid-date records so operators can identify the exact source file/line that was skipped.
- Added ingest summary/telemetry for parse error counts and a pre-ingest database row count log to make it clear when the table is being reset before a new import run.
- Added a backend regression test validating that malformed rows are skipped while valid rows (including text with embedded single-quote + quote marks like `2'6"`) still make it into insert batches.

## What Did Not Work
- Attempted to assert that parsing would continue to later rows within the same malformed CSV file after an unclosed quote; the parser treats that condition as consuming the remainder of the file segment, so the test was revised to validate cross-file continuation instead.
