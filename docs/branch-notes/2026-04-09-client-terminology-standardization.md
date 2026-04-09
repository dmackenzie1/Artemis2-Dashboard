# 2026-04-09 - Client terminology standardization

## Summary
- Renamed root workspace command targets from `frontend` to `client` so lint/test/build/dev script usage aligns with the workspace package rename.
- Renamed the `docker/client` workspace package from `frontend` to `client` and regenerated the root lockfile metadata.
- Updated Docker Compose and nginx upstream references from `frontend` to `client` to keep container routing labels consistent.
- Updated top-level/client workspace docs and the client smoke test label to use `client` terminology.

## Validation
- `npm run lint`
- `npm run test`

## What Did Not Work
- No failed implementation attempts were required for this change.
