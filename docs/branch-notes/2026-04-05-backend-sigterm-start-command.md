# 2026-04-05 - Backend SIGTERM start-command noise

## Summary
- Reproduced backend build/test flow in the `backend` workspace and confirmed TypeScript compilation and Vitest suites pass.
- Updated the backend container runtime command to run `node dist/index.js` directly instead of launching through `npm run start`.
- Goal: prevent npm lifecycle `SIGTERM` noise from being reported as a startup failure when the container receives a normal termination signal.

## What Did Not Work
- Keeping `CMD ["npm", "run", "start"]` preserved the noisy lifecycle failure output on termination (`npm error signal SIGTERM`), which obscures real startup/runtime errors.

## Validation
- `npm --workspace docker/server run build`
- `npm --workspace docker/server run test`
- `npm run lint`
- `npm run test`
