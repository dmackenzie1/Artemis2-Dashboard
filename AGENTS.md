# EMSS Group - Universal AI Agent Context

## Workspace Overview
You are operating within the EMSS (Earth Observing System Mission Support) group at NASA JSC. This directory contains multiple independent projects, not a single monorepo (though `@emss/packages` is an internal NPM monorepo).

**Core Mandate:** When modifying code in *any* of these repositories, you must strictly adhere to the established "EMSS Standard Stack" and utilize our internal tooling.

## The EMSS Standard Stack
While versions occasionally drift, our target architecture for all web applications is:
- **Language**: TypeScript (Strict mode enabled)
- **Frontend**: React 19 + Vite 7 (Redux Toolkit only if needed)
- **Backend**: Express 5 + PostgreSQL + MikroORM
- **Authentication**: NASA LaunchPad OAuth2 (via `oauth2-proxy` and `@emss/oauth2-proxy-*` packages)
- **Testing**: Vitest (Do not use Jest unless modifying legacy `maestro` code)
- **Containerization**: Docker Compose

## Universal Developer Commands
Regardless of the repository (`coda`, `talky-bot`, `aegis`, `maestro`, `logs`), the development lifecycle is identical. You MUST use these tools:

1. **Environment Variables (CRITICAL)**: 
   - NEVER read from `process.env` directly.
   - NEVER manually edit `.env` or `.env.secret`.
   - Variables are defined in `env.config.ts`.
   - To generate a local `.env` file, run: `npx @emss/make-dotenv` (or `npm run make-dotenv`).

2. **Docker Orchestration**:
   - We use a wrapper script called `appcompose`.
   - To build: `./appcompose dev build`
   - To start: `./appcompose dev up -d`
   - This wraps `docker compose -f docker-compose.yml -f docker-compose.dev.yml` (or `.services.yml`).

3. **CI/CD & Code Quality**:
   - We use GitLab CI with templates from the `gitlab-templates` repository.
   - Always run `npm run lint` and `npm run test` before proposing commits.
   - Commits must follow Conventional Commits (`feat:`, `fix:`, `chore:`) to satisfy our automated release/Renovate pipelines.

## Critical Project Nuances & Agent Warnings

### Node.js Monoliths vs Workspaces
- **`talky-bot`**: Uses NPM Workspaces (`apps/client`, `apps/server`). You must strictly respect this boundary. Run commands from the correct workspace.
- **`coda`, `aegis`, `maestro` (DANGER)**: These use a flat `src/` monolith structure where frontend and backend share a `package.json`. **Do not accidentally import server-side code (like Express or MikroORM) into React components, as this will leak secrets into the browser bundle.** 

### Testing Version Drift
- Always check the `package.json` for testing tools. `maestro` is legacy and relies on **Jest** (v29). `coda`, `aegis`, and `talky-bot` use **Vitest** (v4+). Do not mix testing assertions.

### Python Repositories (`autoref`, `talky-transcribe`, etc.)
- **Dependency Manager:** All Python projects use `uv` (`uv sync`, `uv run`, `uv add`). Never use `pip` directly.
- **Testing:** We standardize on `pytest`.
- **Python Version Drift:** Before writing Python code, always inspect the `pyproject.toml` `requires-python` field. Versions are fragmented (ranging from `>=3.10` to `==3.12.*`). Do not introduce syntax unsupported by the pinned minimum version.

## AI Agent Coding Style & Nuance Guide

**CRITICAL:** You must write code that is indistinguishable from human EMSS developers. Do not write generic boilerplate.

### TypeScript & React (Frontend)
- **Component Declarations:** Use `FunctionComponent` (or `FC`) with strongly typed inline props. (e.g., `export const FrameHeader: FunctionComponent<{ id: number }> = ({ id }) => { ... }`). Do not use standard `function Component()` unless in legacy code.
- **Styling:** The EMSS standard uses **CSS Modules** (`import styles from "./frame.module.css"`), *not* Tailwind CSS (except in `EMSSpresso`).
- **Type Imports:** Always use `import type` for interfaces.
- **State Management:** Use standard React hooks (`useState`, `useContext`) by default. If Redux Toolkit is strictly needed for complex global state, export `initialState` explicitly at the top of the file, and strictly type the `action: { payload: T }` inline within reducers. 
- **Utilities:** Rely heavily on `lodash` for checks (`import isNil from "lodash/isNil";`).
- **No `console.log`:** Use the internal logger: `import { clientLogger } from "utils/logging/clientLogger"`.

### Node.js & Express (Backend)
- **Dependency Injection:** Do not pass socket instances through long chains. Use the global `DI` object (`DI.socketio.emit(...)`).
- **Validation:** Use `zod` for validating all incoming request payloads.
- **API Types:** Use standard TypeScript interfaces or custom DTOs for returning records via the API.
- **Time/Date:** Exclusively use `dayjs` extended with the `utc` plugin. Never use raw `Date` objects or `moment`.
- **Environment:** NEVER read from `process.env` directly inside business logic.
- **Transcript Retrieval Focus:** For transcript query/search flows, prioritize timestamp/date, channel, and transcript text as primary evidence. Treat duration/language/translated/filename metadata as optional unless explicitly requested, and preserve loop/channel-group context (crew loops vs flight-control loops) in outputs.

### Python (AI/ML)
- **Type Hinting:** Every function signature must have complete type hints (`def process(data: dict) -> list[str]:`).
- **Linter Compliance:** Code must pass `ruff` strictly (`pycodestyle`, `flake8-bugbear`, `flake8-simplify`, `pylint`).

### Changelog & Paper Trail Enforcements
When an AI agent finishes a task, it must fulfill the EMSS paper trail requirements:
1. **Branch Notes:** Update the `docs/branch-notes/YYYY-MM-DD-<task>.md` file. You must explicitly log "What Did Not Work" if you attempted a solution that failed.
2. **Intent-Driven Changelog:** Add a line to `CHANGELOG.md` under `## [Unreleased]`. The line MUST end with an `Intent: <explanation>` clause explaining why the change was made for future maintainers.

## Security Rules
- NEVER hardcode secrets. Always use `env.config.ts` or `env.secret.ts`.
- When modifying deployment scripts or `docker-compose.yml`, note that we deploy to FIT (Facility for Integration and Testing) servers (carbon, gold, iron, neon, oxygen). Ensure configurations respect this target environment.
