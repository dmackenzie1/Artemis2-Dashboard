# 2026-04-06 - Thorough code review polish pass

## Summary
- Fixed a frontend API regression in `chat(...)` where the request body referenced `mode` without having the parameter in scope. The helper now accepts an optional `mode` argument and defaults to `"rag"`.
- Added frontend test coverage for explicit mode override (`"all"`) in chat requests.
- Hardened notable moments page loading with explicit client-side error logging for failed fetches.
- Updated top-level README setup instructions to match EMSS workflow expectations (`npx @emss/make-dotenv` and `./appcompose dev ...`).

## Validation
- Ran `npm run lint` at repository root (passes after changes).
- Ran `npm run test` at repository root (passes after changes).

## What Did Not Work
- Initial `npm run lint` and `npm run test` failed before fixes due to `mode is not defined` in `docker/client/src/api.ts` and a resulting frontend test failure.
- An initial patch was applied via `exec_command` using `apply_patch` shell invocation, which raised a tooling warning. Subsequent edits were applied with the dedicated `apply_patch` tool.
