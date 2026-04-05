# 2026-04-05 - hourly stats query and error logging hardening

## Summary
- Fixed hourly channel stats SQL to inline a validated day window value after clamping it to `[1, 30]`, removing the failing `$1` placeholder path.
- Added route-level error logs for `/api/stats/summary`, `/api/stats/days`, and `/api/stats/channels/hourly` so failed stats requests emit structured diagnostics.
- Added shared unknown-error serialization and wired it into startup ingestion, ingest endpoint failures, and global Express error handling to include error name/message/stack.

## What Did Not Work
- Initially relied on `execute(query, [safeDays])` parameter binding for the hourly SQL in this runtime, but PostgreSQL still received an unbound `$1` and threw `there is no parameter $1`.
