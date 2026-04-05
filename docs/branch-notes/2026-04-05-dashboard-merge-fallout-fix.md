# 2026-04-05 — Dashboard merge fallout fix

## Summary
- Repaired `DashboardPage` polling tuple ordering so all four async payloads (`dashboard`, `health`, `pipeline`, `stats`) are fetched and assigned to matching state setters.
- Restored missing `DashboardToolbar` import and reintroduced local `health` state wiring so the toolbar receives `HealthData | null` as expected.
- Verified workspace lint/test/build flows to ensure the Docker frontend build TypeScript errors are resolved.

## What Did Not Work
- The merged `Promise.all` destructure shape with four local variables and only three promises did not type-check and also shifted payload assignments into wrong state setters.
- Rendering `DashboardToolbar` without importing the component and without defining the `health` state variable failed compilation.
