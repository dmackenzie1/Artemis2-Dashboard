# 2026-04-05 — Fix backend startup failure from lodash ESM named import

## Summary
- Replaced `import { groupBy, uniq } from "lodash"` with a default lodash import and object destructuring in `analysisService`.
- This resolves Node.js ESM runtime startup failure in the backend container where named exports from CommonJS `lodash` are not available.
- Restored backend availability so nginx can reach the API upstream instead of returning `502` for `/api/dashboard` and `/api/ingest`.

## What Did Not Work
- Keeping the named import (`import { groupBy, uniq } from "lodash"`) failed at runtime under Node.js v22 ESM with `SyntaxError: Named export 'groupBy' not found`.
