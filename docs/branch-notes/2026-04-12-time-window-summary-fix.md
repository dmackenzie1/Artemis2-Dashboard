# 2026-04-12 Time Window Summary Fix

## What Worked
Identified that unquoted `audioFileName` references in `transcript_utterances` raw SQL queries get folded to lowercase by Postgres, causing missing column errors because the true schema column is `audio_file_name`. The Complete summary bypasses this bug because it reads from intermediate persisted summary artifacts instead of raw utterance rows. Fixed the `audioFileName` reference in both `timeWindowSummaryService.ts` and `transcriptCandidateService.ts`. Bumped package versions to `0.3.1`.

## What Did Not Work
Initially reviewed codebase assuming `audioFileName` projection had been updated as described, but found raw SQL still contained `audioFileName`. Attempting to fix just one location was insufficient as `transcriptCandidateService.ts` suffered from the exact same mapping bug in its overlap-ranking SQL.