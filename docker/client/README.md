# Client workspace

React 19 + Vite client for the TalkyBot Transcript Review Dashboard.

## Scope

This workspace owns:
- Page routing and mission-review UX
- Dashboard panel composition with component-owned API/poll/error/result state
- Parent-page refresh notification wiring (admin refresh signal only, no centralized overview fetch controller)
- Typed API client wrappers for `/api/*`
- Shared client formatting/logging helpers

## Commands

From repository root:

```bash
npm run dev:client
npm run lint -w client
npm run test -w client
npm run build -w client
```

## Runtime contracts

- API base path is fixed to `/api` via NGINX reverse proxy in containerized runs.
- `?admin=true` query mode enables admin-only refresh controls in the top bar.
- Health status is polled every 5 minutes and shown in the global top bar.

## Architecture docs

For implementation-level file-by-file details, see `docker/client/ARCHITECTURE.md`.

## Documentation contracts

- Keep this README focused on workspace scope, commands, and runtime contracts.
- Keep file-level ownership and flow details in `ARCHITECTURE.md`.
- Preserve the panel-isolation contract: each dashboard panel owns its own loading/error/result state and API lifecycle; parent pages only broadcast refresh notifications.
