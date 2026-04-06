# 2026-04-06 - Production volume hardening

## Summary
- Added persistent Postgres storage via a named Docker volume (`db_data`) in `docker-compose.yml`.
- Added host bind mounts for LLM debug payload capture directories:
  - `./.local/query-set`
  - `./.local/query-receive`
- Updated LLM debug artifact persistence to write outgoing payloads into `query-set` and incoming payloads into `query-receive` beneath `LLM_DEBUG_PROMPTS_DIR`.
- Updated `README.md` with revised Docker volume mapping behavior and a production-readiness checklist that calls out migration strategy, secret handling, and debug artifact retention cautions.
- Added matching changelog entry under `## [Unreleased]`.

## What Did Not Work
- Initial idea was to leave outgoing/incoming payload files in a single debug directory and rely only on filename prefixes (`outgoing_`/`incoming_`). This did not satisfy the operator request for separately mounted local paths, so the implementation was revised to write into dedicated `query-set` and `query-receive` subdirectories.

## Validation
- `npm run lint`
- `npm run test`
