# 2026-04-11 - Increase LLM prompt max length and restore Overview as landing page

## What Changed
- Added `LLM_MAX_USER_PROMPT_CHARACTERS` to backend environment config with a default of `1,250,000` characters.
- Wired `LLM_MAX_USER_PROMPT_CHARACTERS` into `createServerRuntime` so `LlmClient` enforces the new configurable ceiling instead of relying only on the constructor default.
- Updated client routing so `/` redirects to `/overview` again (instead of `/chat`) to restore Overview as the landing page.

## Why
- Pipeline logs showed repeated `LLM request rejected: user prompt exceeds max length` failures where `requestUserLength` reached ~1.10M characters while the prior ceiling was 800k.
- Operators requested returning the app's default entry point to Overview.

## What Did Not Work
- No failed implementation attempts during this change.
