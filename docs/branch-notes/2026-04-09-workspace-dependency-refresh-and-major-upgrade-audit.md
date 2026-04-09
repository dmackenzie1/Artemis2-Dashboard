# 2026-04-09 - Workspace dependency refresh and major-upgrade audit

## Summary
- Ran `npm update`, `npm install`, `npm audit`, and `npm audit fix` at the root and in both workspaces (`docker/client`, `docker/server`) to refresh lockfile resolution and verify vulnerability status.
- Applied major-version upgrades where they were compatible (`vite` 8, `@vitejs/plugin-react` 6, `typescript` 6, React/React DOM patch bumps, and server/client dev/type package bumps) and regenerated the workspace lockfile.
- Kept MikroORM packages on the latest stable 6.x line after validating that 7.x introduces a Node engine requirement (`>=22.17.0`) that does not match this repository's current Node 20 runtime.
- Removed unused dependencies identified by depcheck (`jsdom` at the root workspace and `@mikro-orm/cli` in the server workspace) and revalidated lint/test.

## Validation
- `npm outdated --workspaces --include-workspace-root`
- `npm run lint`
- `npm run test`
- `npx depcheck` (root, client, server)

## What Did Not Work
- A direct upgrade to MikroORM 7 initially compiled only after API changes (`getSchemaGenerator().updateSchema()` → `orm.schema.update()`), but produced Node engine incompatibility warnings against the current environment (`node v20.19.6`), so that upgrade path was rolled back to stable 6.x.
