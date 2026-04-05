# 2026-04-05 - CSV ingestion quote resilience

## Summary
- Enabled relaxed quote parsing in backend CSV ingestion so rows with embedded unescaped quote characters no longer abort startup ingestion.
- Added a regression test covering transcript text that includes values like `2'6"` to verify the parser still accepts and persists those rows.

## What Did Not Work
- Running with default `csv-parse` quote handling still throws `Invalid Opening Quote` on real-world rows where quote characters appear unescaped in unquoted fields.
