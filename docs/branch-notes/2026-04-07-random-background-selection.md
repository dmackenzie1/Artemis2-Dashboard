# 2026-04-07 - Random background selection

## Summary
- Added mission background asset imports in the client bootstrap and select one image randomly on startup.
- Set a global CSS custom property (`--mission-background-image`) from JavaScript so all routes continue using the same shared background layer styling while rotating source imagery per load.
- Updated the shared stylesheet to consume the custom property and keep the original default image as a fallback.

## Validation
- Ran `npm run lint` at repo root.
- Ran `npm run test` at repo root.

## What Did Not Work
- Initial lint run failed because TypeScript did not have static asset module declarations for imported `.png`/`.jpg` files in `main.tsx`; adding image module declarations in `docker/client/src/types.d.ts` resolved the compile errors.
