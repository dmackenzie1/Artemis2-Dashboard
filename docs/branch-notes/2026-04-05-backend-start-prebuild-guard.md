# 2026-04-05 - Backend start prebuild guard

## Summary
- Performed a backend startup code review covering workspace scripts, TypeScript compile output location, and runtime entrypoint assumptions.
- Reproduced the startup failure when `docker/server/dist` is missing and `npm run start -w backend` is executed directly.
- Added a `prestart` script in `docker/server/package.json` so `npm start` always compiles TypeScript before executing `node dist/index.js`.
- Updated root `.gitignore` to reflect the current workspace layout (`/docker/server/dist`, `/docker/client/dist`) so build artifacts remain untracked.

## What Did Not Work
- Running `npm run start -w backend` without a prior build failed with `MODULE_NOT_FOUND` for `docker/server/dist/index.js` because the runtime expected compiled output that did not yet exist.

## Validation
- `python - <<'PY' ...` (remove `docker/server/dist` to reproduce startup failure)
- `npm run start -w backend` (failure reproduced before fix)
- `npm run start -w backend` (passes prebuild + runtime boot after fix)
- `npm run lint`
- `npm run test`
