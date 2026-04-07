# 2026-04-07 - Frontend jsdom test runtime dependency stabilization

## Summary
- Added `jsdom` to the root workspace `devDependencies` so Vitest can resolve the jsdom environment when frontend tests are invoked from the repo root workspace command path.
- Regenerated `package-lock.json` metadata after the dependency manifest update.
- Added an Unreleased changelog entry documenting intent and operational impact.

## What Did Not Work
- Frontend tests initially failed with `ERR_MODULE_NOT_FOUND` for `jsdom` despite `docker/client/package.json` declaring it; resolving from the root workspace runtime still failed in this environment until root-level dependency alignment.

## Validation
- `npm run lint`
- `npm run test`
