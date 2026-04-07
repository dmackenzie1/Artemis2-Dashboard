# Client (frontend workspace)

React 19 + Vite client for the TalkyBot Transcript Review Dashboard.

## Scope

This workspace owns:
- Page routing and mission-review UX
- Dashboard panel composition with component-owned API/poll/error/result state
- Parent-page refresh notification wiring (admin refresh signal only, no centralized overview fetch controller)
- Typed API client wrappers for `/api/*`
- Shared frontend formatting/logging helpers

## Commands

From repository root:

```bash
npm run dev:client
npm run lint -w frontend
npm run test -w frontend
npm run build -w frontend
```

## Runtime contracts

- API base path is fixed to `/api` via NGINX reverse proxy in containerized runs.
- `?admin=true` query mode enables admin-only refresh controls in the top bar.
- Health status is polled every 5 minutes and shown in the global top bar.

## Architecture docs

For implementation-level file-by-file details, see `docker/client/ARCHITECTURE.md`.
