# 2026-04-06 - Thorough code review and architecture documentation pass

## Summary

- Ran a broad static hygiene sweep across frontend/server workspaces (typecheck, tests, TODO scan, export-usage scan).
- Removed confirmed dead frontend artifacts:
  - Unused `DashboardToolbar` component file.
  - Unused pipeline stats API helper/type in `docker/client/src/api.ts`.
  - Unused exported `NotableMomentsDay` type in `docker/client/src/api.ts`.
- Reworked top-level docs strategy to avoid duplication and point maintainers to workspace-specific authoritative docs.
- Added new client/server README + architecture references with file-by-file maps for faster onboarding.

## What changed

- `README.md`
  - Reduced duplicated implementation detail and converted to a documentation index with setup/operations quick paths.
- `docker/client/README.md`
  - Added workspace scope, commands, runtime notes, and architecture pointer.
- `docker/client/ARCHITECTURE.md`
  - Added complete file-by-file mapping for `docker/client/src` and explicit frontend dead-code findings.
- `docker/server/README.md`
  - Added backend workspace scope, commands, runtime notes, and architecture pointer.
- `docker/server/ARCHITECTURE.md`
  - Added complete file-by-file mapping for `docker/server/src` and server hygiene findings.
- `docker/client/src/api.ts`
  - Removed dead exports (`PipelineStatsData`, `fetchPipelineStats`, `NotableMomentsDay`).
- `docker/client/src/components/dashboard/DashboardToolbar.tsx`
  - Removed unused file.
- `CHANGELOG.md`
  - Added unreleased entry with explicit intent clause.

## What did not work

- Attempted `npx ts-prune docker/client/tsconfig.json` (without `-p`) initially; command failed because `ts-prune` searched for a non-existent root `tsconfig.json`.
- Corrected invocation to `npx ts-prune -p <workspace-tsconfig>` for both workspaces.

## Validation

- `npm run lint`
- `npm run test`
- `npx ts-prune -p docker/client/tsconfig.json`
- `npx ts-prune -p docker/server/tsconfig.json`
- `rg -n "TODO|FIXME|HACK|XXX|@ts-ignore|eslint-disable" ...`
