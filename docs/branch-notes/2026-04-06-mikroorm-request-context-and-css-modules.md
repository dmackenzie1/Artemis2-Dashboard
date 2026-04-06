# 2026-04-06 - MikroORM request context, CSS module cleanup, and centralized dayjs bootstrap

## Summary
- Added MikroORM `RequestContext` middleware for DB-enabled API requests and switched transcript/stats/pipeline services to consume EntityManager providers that resolve request-scoped EntityManagers when available.
- Updated startup/manual transcript ingestion paths to fork a fresh EntityManager per run instead of reusing a long-lived singleton fork.
- Refactored frontend styling usage from global string class names to CSS Modules by renaming `styles.css` to `styles.module.css` and updating component/page/primitives imports and class references.
- Added frontend TypeScript CSS module declarations via `src/types.d.ts`.
- Centralized `dayjs.extend(utc)` in `server/src/lib/dayjs.ts` and updated server modules to import the shared `dayjs` instance.

## Validation
- `npm run lint`
- `npm run test`

## What Did Not Work
- An initial scripted pass for dayjs import rewrites duplicated content blocks in `server/src/lib/csvIngest.ts` and `server/src/entities/TranscriptUtterance.ts`; this caused TypeScript duplicate symbol errors. The duplicated sections were removed and lint/tests were rerun successfully.
