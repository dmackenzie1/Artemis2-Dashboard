# 2026-04-06 - Async request standardization (server + client)

## Summary
- Updated client page-level fetch call sites that still used promise chains (`.then`) to use explicit async functions with `await`, consistent error logging, and unmount guards before setting React state.
- Added topic-route safety refinements on the client by URI-encoding `title` and resetting stale topic UI state on route changes before the next async load resolves.
- Reverted no-op server async wrappers on purely synchronous cache-read endpoints so handlers stay simple while retaining async route handlers where true IO/await work occurs.
- Kept API contracts unchanged; this is a request-flow consistency refactor.

## What Did Not Work
- Initial lint run failed because workspace dependencies were not fully installed (`Cannot find module 'redis'` from backend TypeScript checks).
- Resolved by running `npm install` at repo root and rerunning lint/test successfully.

## Validation
- `npm run lint`
- `npm run test`
