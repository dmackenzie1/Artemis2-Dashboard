# EMSS Group - AI Agent Coding Style & Nuance Guide

**CRITICAL INSTRUCTION FOR AI AGENTS:** You are acting as a Senior Software Engineer in the NASA EMSS (Earth Observing System Mission Support) group. You must write code that is indistinguishable from the human developers on this team. 

Do not write generic, boilerplate AI code. Adhere strictly to the nuances, formatting, and structural rules defined below.

## 1. TypeScript & React (Frontend)
We use strict TypeScript, React 18/19, Vite, Redux Toolkit, and **CSS Modules**. 

### What WE DO:
- **Component Declarations:** We define React components using `FunctionComponent` (or `FC`) with strongly typed inline props.
  - *Yes:* `export const FrameHeader: FunctionComponent<{ frameID: number; paneType: string; }> = ({ frameID, paneType }) => { ... }`
  - *No:* `export function FrameHeader({ frameID, paneType }: Props) { ... }`
- **Styling (CSS Modules):** Do NOT use Tailwind CSS (unless specifically working inside `EMSSpresso`). The EMSS standard uses CSS Modules.
  - *Yes:* `import styles from "./frame.module.css";` -> `<div className={styles.header}>`
- **Type Imports:** Always use `import type` for interfaces to allow Vite/esbuild to strip them.
  - *Yes:* `import type { ReactNode } from "react";`
- **Redux Toolkit (`@reduxjs/toolkit`):** We use `createSlice`. Export the `initialState` explicitly at the top of the file, and strictly type the `action: { payload: T }` inline within reducers. 
  - *Example:* `setLiveVideoEnabled: (state, action: { payload: boolean }) => { state.liveVideoEnabled = action.payload; }`
- **Utility Libraries:** We rely heavily on `lodash` for checks. (e.g., `import isNil from "lodash/isNil";`).

### What WE DO NOT DO:
- **No `any`:** Never use `any`. Use `unknown` if dynamic, and use type guards.
- **No `console.log`:** Do not leave `console.log` in the code. We use the internal logger: `import { clientLogger } from "utils/logging/clientLogger";`.
- **No Default Exports:** Prefer named exports to ensure refactoring safety across the codebase (except for Vite config files or page routes).

## 2. Node.js & Express (Backend)
We use Express 5, TypeScript, and `@mikro-orm/postgresql`, strictly separated from the frontend via NPM Workspaces.

### What WE DO:
- **Dependency Injection (DI):** We do not pass database connections or socket instances through long function chains. We use a global `DI` object exported from a central file.
  - *Example:* `DI.socketio.to(audioFile.channel.slug).emit("audioFile", audioFile);`
- **Schema Validation (`zod`):** We use Zod for validating all incoming request payloads and environment variables.
  - *Yes:* `import * as z from "zod";` -> `const schema = z.object({ ... });`
- **ORM Interfaces:** When returning database records via the API, use MikroORM's `EntityDTO` type.
  - *Yes:* `const emitAudioFile = (audioFile: EntityDTO<AudioFile>): void => { ... }`
- **Time/Date Management:** We exclusively use `dayjs` extended with the `utc` plugin for datetime manipulation. Do not use raw JS `Date` objects or `moment`.

### What WE DO NOT DO:
- **No `process.env`:** NEVER read from `process.env` directly inside business logic. Always validate at startup and import from a centralized config.

## 3. Python (AI/ML & Scripts)
We use Python 3.11+, `uv`, `pytest`, and `ruff`.

### What WE DO:
- **Type Hinting:** Every function signature must have complete type hints.
  - *Yes:* `def process_telemetry(data: dict, strict: bool = False) -> list[str]:`
- **Linter Compliance:** Code must pass `ruff` strictly (`pycodestyle`, `flake8-bugbear`, `flake8-simplify`, and `pylint`).

### What WE DO NOT DO:
- **No `pip`:** Never generate instructions or scripts that use `pip`, `requirements.txt`, or `venv`. Always use `uv` (`uv sync`, `uv run`).

## 4. Changelog & Paper Trail Enforcements
When an AI agent finishes a task, it must fulfill the EMSS paper trail requirements:
1. **Branch Notes:** Update the `docs/branch-notes/YYYY-MM-DD-<task>.md` file. You must explicitly log "What Did Not Work" if you attempted a solution that failed.
2. **Intent-Driven Changelog:** Add a line to `CHANGELOG.md` under `## [Unreleased]`. The line MUST end with an `Intent: <explanation>` clause explaining why the change was made for future maintainers.