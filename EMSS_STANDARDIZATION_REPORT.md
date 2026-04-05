# EMSS Group Standardization Report & State of the Union

## High-Level Assessment: What We Are Doing Right, and Where We Can Improve

The EMSS (Earth Observing System Mission Support) group operates as a mature, forward-thinking software organization. We build complex, mission-critical full-stack applications (`talky-bot`, `aegis`, `maestro`, `logs`, `coda`) alongside cutting-edge Python AI pipelines (`autoref`, `talky-transcribe`). 

Overall, our infrastructure, security, and developer-experience foundations are incredibly strong. We have successfully standardized the hard parts of enterprise development: deployments, authentication, and environment management. However, as our application portfolio has grown, we are experiencing significant "version drift" and architectural fragmentation (particularly in how frontend and backend code is structured in Node repositories).

### What We Are Doing Right (Our Triumphs)
*   **Security & Environment Management:** The universal use of `env.config.ts` paired with `@emss/make-dotenv` is brilliant. We have completely eliminated the risk of raw `.env` files leaking secrets into version control.
*   **Authentication Standardization:** Every single web application perfectly integrates NASA LaunchPad OAuth2 via `oauth2-proxy` and the internal `@emss/oauth2-proxy-*` packages. We don't reinvent the wheel for auth.
*   **Developer Experience (DX):** The `./appcompose` wrapper standardizes the complex Docker Compose lifecycle across every single repository. A developer can jump from `coda` to `logs` and immediately know how to spin up the stack (`./appcompose dev up -d`).
*   **Python Tooling:** We have rapidly and universally adopted `uv` (Astral) for Python dependency management and virtual environments, pushing our ML and scripting pipelines to the bleeding edge of the Python ecosystem.
*   **CI/CD Maturity:** The heavy reliance on `emss/gitlab-templates` ensures that container builds, linting, and "FIT" environment deployments are globally governed and easily auditable.

### What We Are Doing Wrong (Areas for Improvement)
*   **Massive Version Drift:** Our foundational libraries have drifted far apart. `maestro` is stuck on React 17 and Jest, while `coda` and `talky-bot` are blazing ahead on React 19 and Vitest. Even our infrastructure isn't immune: we have Postgres running on versions 14.x through 17.x, and `oauth2-proxy` versions scattered from `v7.5.1` to `v7.13.0`.
*   **Monolithic Repository Structures:** With the exception of `talky-bot`, our Node.js apps (`aegis`, `coda`, `maestro`) dump all frontend and backend dependencies into a single, massive `package.json` file inside a flat `src/` directory. This creates bloated CI pipelines, confuses IDE language servers, and risks server-side code leaking into browser bundles.
*   **Configuration Duplication:** We maintain identical copies of `.prettierrc.json` and fragmented `eslint.config.mjs` files in almost every repository instead of centralizing these rules inside our `@emss/packages` monorepo.
*   **Python Version Pinning:** Our `pyproject.toml` files request highly fragmented Python environments (ranging from `==3.11.*` strict pins to `>=3.10` ranges), making shared CI runners and local environments harder to maintain.

---

## 1. Architectural Patterns & Infrastructure (The "FIT" Standard)

The EMSS group has successfully established a highly consistent infrastructure and deployment methodology across almost all web applications.

### 1.1 Triumphs of Standardization
*   **Orchestration Wrapper:** Every application universally uses `./appcompose` (`dev build`, `dev up -d`) to manage Docker Compose environments. This drastically reduces the onboarding curve for new developers.
*   **Deployment Configuration:** You share consistent YAML structures for deployment (`docker-compose.yml`, `docker-compose.services.yml`, `docker-compose.preview.yml`) alongside `.fitdock.yml` for FIT environments (carbon, gold, iron, neon, oxygen).
*   **Authentication:** NASA LaunchPad integration is entirely standardized. Every web app uses `quay.io/oauth2-proxy/oauth2-proxy` in front of the application, backed by Redis for session storage, and integrates via `@emss/oauth2-proxy-frontend` and `@emss/oauth2-proxy-backend`.
*   **Environment Variables:** The group has completely eliminated raw `.env` files from version control and manual `process.env` reading. The `env.config.ts` pattern paired with `npx @emss/make-dotenv` is a massive security and DX win.

### 1.2 Infrastructure Version Drift
Despite the shared architecture, the specific versions of backing services running in our Docker Compose files have drifted significantly.

| Service | `coda` | `talky-bot` | `aegis` | `logs` | `maestro` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | Variable (via Env) | `14.20-alpine3.21` | Variable (via Env) | N/A | `17.6-alpine3.22` |
| **Redis** | `7.2.4-alpine3.19` | `7.4.7-alpine3.21` | `7.2.5-alpine3.19` | `7.4.7-alpine3.21` | `7.2.5-alpine3.19` |
| **OAuth2-Proxy** | `v7.5.1` | `v7.13.0` | `v7.11.0` | `v7.5.1` | `v7.5.1` |
| **OpenSearch** | N/A | N/A | N/A | `2.19.3` | N/A |

*Observation: There are multiple references to a pending `postgres:14.12-alpine` image awaiting MR !36 in `emss/docker-images`. Meanwhile, `maestro` has jumped ahead to PostgreSQL 17.6.*

---

## 2. The TypeScript / Node.js Ecosystem

The core web applications are all TypeScript-based, but they represent three distinct generations of EMSS development.

### 2.1 Generation Categorization
*   **Legacy (Gen 1):** `maestro`. React 17, Vite 6, Jest, Express 4. Monolithic structure.
*   **Current (Gen 2):** `aegis`, `coda`. React 18/19, Vite 7, Vitest, Express 5. Flat `src/` monolithic structure.
*   **Modern (Gen 3):** `talky-bot`. React 19, Vite 7, Vitest, Express 5. Implements NPM Workspaces (`apps/client`, `apps/server`) for strict backend/frontend separation.

### 2.2 Deep TypeScript Version Matrix

| Dependency | `coda` | `talky-bot` (Client/Server) | `aegis` | `logs/opensearch-utils` | `maestro` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TypeScript** | `5.9.3` | `5.9.3` | `5.9.3` | `^5.9.3` | `5.5.4` |
| **React** | `19.2.3` | `19.2.3` | `18.3.1` | `^19.2.4` | `17.0.2` |
| **Redux Toolkit** | `2.11.2` | N/A | `2.11.2` | N/A | `1.9.7` |
| **Vite** | `7.3.1` | `7.3.1` | `7.3.1` | `^7.3.1` | `6.3.5` |
| **Testing** | Vitest `4.0.16` | Vitest `4.0.18` | Vitest `4.1.0` | Vitest | Jest `29.7.0` |
| **Express** | `5.x` | `5.x` | `5.x` | `^5.2.1` | `4.21.2` |
| **MikroORM** | `6.6.3` | `6.5.9` | `6.6.9` | N/A | `^6.4.16` |
| **Node Types**| `24.10.4` | `24.12.0` | `24.12.0` | `^25.0.3` | `22.13.1` |

### 2.3 Monoliths vs Workspaces
`coda`, `aegis`, and `maestro` use a flat repository structure where backend (Express, MikroORM) and frontend (React, DOM) dependencies share a single `package.json` and a single `node_modules` folder.
*   *Risk*: This risks server-side code (and secrets) leaking into the frontend bundle if imports are not strictly managed, and it bloats the CI/CD pipeline.
*   *Solution*: `talky-bot` correctly isolates these domains using NPM Workspaces, representing the optimal path forward for all EMSS Node apps.

---

## 3. The Python Ecosystem

The EMSS group maintains several Python repositories, largely focused on AI, ML, transcription, and geolocation (`autoref`, `talky-transcribe`, `groupstats`, `llm-coding`, `quantumleap`).

### 3.1 Python Triumphs
*   **Package Management:** The group has completely standardized on `uv` (Astral) for dependency management and virtual environments, which is the current industry gold standard for speed.
*   **Testing:** `pytest` is universally adopted across Python repos.

### 3.2 Python Version Drift
Python version pinning is highly fragmented across `pyproject.toml` files:
*   `autoref`: `>= 3.10, < 3.13`
*   `go-up`, `llm-coding`: `>=3.11`
*   `talky-transcribe`: `>=3.11,<3.12`
*   `talky-capture`: `==3.11.*`
*   `texty-bot`: `==3.12.*`
*   `groupstats`, `quantumleap`: `>=3.12`

---

## 4. Quality Assurance, Linting & CI/CD

### 4.1 GitLab CI and Renovate
*   All projects are heavily integrated with the `emss/gitlab-templates` repository, meaning updates to deployment strategies can be centrally managed.
*   `renovate.json` is present everywhere, which is excellent for automated dependency updates, though it requires strict semver compliance and good test coverage to be trusted.

### 4.2 Code Quality Configuration Fragmentation
Currently, every repository defines its own rules for code quality:
*   `.prettierrc.json` is duplicated across all repos.
*   `eslint.config.mjs` (or `.eslintrc.js`) is duplicated and occasionally divergent.
*   `stylelint.config.js` exists in `aegis` and `coda`.
*   `.codeclimate.yml` is used in `aegis`, `coda`, and `maestro` but absent in others.

---

## 5. Actionable Roadmap for Standardization

To unify the EMSS development experience, we recommend executing the following initiatives, ordered by effort and impact.

### 🟢 Phase 1: The Quick Wins (1-2 Days Effort)

1.  **Docker Compose Container Unification:**
    *   Update all `docker-compose.yml` files to use `quay.io/oauth2-proxy/oauth2-proxy:v7.13.0`.
    *   Update all Redis containers to `redis:7.4.7-alpine3.21`.
    *   Finalize MR !36 in `docker-images` to unblock a single, unified PostgreSQL image version for local dev across all repos.
2.  **Harmonize MikroORM Versions:**
    *   Bump `coda` and `talky-bot` to MikroORM `6.6.9` (matching `aegis`).
3.  **Python Version Baseline:**
    *   Where ML dependencies (like PyTorch) allow, align all Python `pyproject.toml` files to `requires-python = ">=3.11"`.
4.  **Extract Formatting Configs:**
    *   Create `@emss/prettier-config` in the `packages` monorepo. Delete `.prettierrc.json` from all 5 apps and add the package reference to their `package.json`s.

### 🟡 Phase 2: Moderate Lifts (1 Sprint)

1.  **Upgrade Aegis Frontend:**
    *   Bump `aegis` from React 18.3.1 to React 19.2.3.
    *   Align its `@types/node` and `vitest` versions with `coda`.
2.  **Extract ESLint Configs:**
    *   `maestro` already attempts to use `@emss/eslint-config`. Modernize this package for ESLint 9 (Flat Config / `eslint.config.mjs`) and roll it out to `aegis`, `coda`, and `talky-bot`.
3.  **Standardize NPM Scripts:**
    *   Ensure `npm run lint`, `npm run test`, and `npm run build` execute identically. For instance, ensure `lint` also checks Prettier and Stylelint.

### 🔴 Phase 3: Major Strategic Goals (Multi-Sprint)

1.  **The `maestro` Modernization Project:**
    *   *Why*: `maestro` is the oldest codebase and introduces significant cognitive load for developers switching between it and modern apps like `coda`.
    *   *Steps*:
        1. Migrate from Express 4 to Express 5.
        2. Migrate from Jest 29 to Vitest 4.
        3. Upgrade Vite 6 to Vite 7.
        4. Migrate from React 17 to React 19.
        5. Upgrade Redux to Redux Toolkit 2.x.
2.  **NPM Workspaces for All Monoliths:**
    *   *Why*: The flat structure in `aegis` and `coda` is a security and bundling risk.
    *   *Steps*: Refactor `aegis` and `coda` to mirror the `talky-bot` structure:
        *   `apps/client/package.json` (React, Vite, UI dependencies)
        *   `apps/server/package.json` (Express, MikroORM, Server dependencies)
        *   Root `package.json` with `workspaces` array.

---

## Conclusion
The EMSS group has excellent foundational standards—specifically regarding environment variables, authentication, and deployment. By dedicating a few sprints to resolving the version drift (especially around React 19, Vitest, and Postgres) and migrating all Node apps to the NPM Workspace pattern pioneered by `talky-bot`, the group can achieve a frictionless, highly secure, and interchangeable developer experience across all projects.