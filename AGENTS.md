# AGENTS.md

## 1. Project Overview

Full-stack bilingual (English/Danish) telecom glossary. FastAPI backend with async SQLAlchemy, React 19 SPA frontend. Uses a **generic CRUD framework** — domain entities are declared in `resources/` and the framework auto-generates routers, API client functions, and UI pages.

## 2. Repository Structure

```
app/                      # Generic CRUD framework (do not modify for domain changes)
  crud/                   # Router factory, nested router, backup, seed, registry
  auth.py                 # Microsoft Entra ID JWT auth
  database.py             # Async SQLAlchemy engine (SQLite + PostgreSQL)
  main.py                 # App entrypoint, lifespan, auto-registers routers from registry
  models.py               # Base class + re-exports from resources/models.py
  schemas.py              # Re-exports from resources/schemas.py
  seed.py                 # Backward-compat wrapper for crud/seed.py
  services/               # Domain services (e.g. OpenAI recommendation)

resources/                # Domain-specific declarations (modify this for domain changes)
  config.py               # Resource registry — single source of truth for backend
  models.py               # SQLAlchemy ORM models (Category, Term, Definition)
  schemas.py              # Pydantic request/response schemas
  routers/                # Custom routers beyond generic CRUD (e.g. recommend.py)

frontend/
  src/
    config/resources.js   # Resource registry — single source of truth for frontend
    api/client.js         # Generic API client, auto-generates CRUD functions
    components/           # Generic CRUD components (CrudList, CrudCreate, CrudEdit, CrudDetail)
    pages/                # Page components (some override generic CRUD pages)
    hooks/                # Custom React hooks
    auth/                 # MSAL authentication (Entra ID)
    pdf/                  # Client-side PDF generation
  e2e/                    # Playwright end-to-end tests

tests/                    # Backend pytest suite (async, in-memory SQLite)
base_data_import/         # glossary-seed.json (seed data loaded on first run)
alembic/                  # Database migrations (PostgreSQL only; SQLite uses create_all)
k8s/                      # Kubernetes manifests (staging/ and production/)
.github/workflows/        # CI pipelines (reusable workflow files)
.woodpecker/              # Woodpecker CD pipelines (staging + production deploy)
```

## 3. Setup & Commands

### Backend

```bash
# Install dependencies
uv sync

# Start dev server
uv run uvicorn app.main:app --reload --port 8000

# Run tests
uv run pytest

# Lint
uv run ruff check .

# Format check
uv run ruff format --check .

# Auto-format
uv run ruff format .
```

### Frontend

```bash
# Install dependencies
cd frontend && npm install

# Dev server (proxies API to localhost:8000)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Unit tests
npm run test:unit

# E2E tests (requires backend running on :8000)
npm test

# E2E headed
npm run test:headed
```

### Docker

```bash
docker compose up --build -d
```

### Alembic (migrations for PostgreSQL)

```bash
# Generate a new migration after model changes
uv run alembic revision --autogenerate -m "description"

# Apply migrations
uv run alembic upgrade head
```

## 4. Validation Requirements

All of the following must pass before a change is valid:

- `uv run ruff check .` — zero lint errors
- `uv run ruff format --check .` — zero formatting issues
- `uv run pytest` — all backend tests pass
- `cd frontend && npm run lint` — zero ESLint errors
- `cd frontend && npm run test:unit` — all Vitest unit tests pass
- `cd frontend && npm run build` — production build succeeds

CI runs tests on Python 3.11, 3.12, and 3.13. Code must work on all three.

Coverage threshold is 85% (CI-configurable).

## 5. Coding Conventions

### Python

- **Target**: Python 3.11+ (use `|` union syntax, not `Optional`)
- **Linter/formatter**: Ruff (line-length 88, target py311)
- **Enabled rule sets**: E, W, F, I, N, UP, B, SIM, T20, RUF
- **Allowed exceptions**: `B008` (FastAPI `Depends()` in defaults), `N803`/`N806` (PascalCase vars in generic factories)
- **Async throughout**: all DB operations use `async`/`await` with SQLAlchemy 2 async sessions
- **pytest**: `asyncio_mode = "auto"` — test functions are async by default
- **Imports**: `app` and `resources` are known first-party packages (isort config)
- **No print statements**: `T20` rule enforced — use `logging` instead

### Architecture: Generic Framework + Domain Layer

The codebase separates a **generic CRUD framework** (`app/`) from **domain-specific code** (`resources/`):

- New entities: add models to `resources/models.py`, schemas to `resources/schemas.py`, register in `resources/config.py`
- Custom endpoints beyond CRUD: add routers in `resources/routers/`, register in `resources/config._load_custom_routers()`
- **Do not add domain logic to `app/`** — it is meant to be reusable across projects
- `app/models.py` and `app/schemas.py` are re-export shims for backward compatibility

### Backend Patterns

- All routers require authentication via `Depends(require_auth)`
- `AUTH_DISABLED=true` bypasses JWT validation for local dev
- FK references are validated before create/update (returns 422)
- Unique field violations return 409
- Protected-on-delete resources return 409 if still referenced
- Errors use `HTTPException` with appropriate status codes
- Services in `app/services/` are standalone async functions, not classes

### Frontend

- **React 19** with JSX (`.jsx` files, not TypeScript)
- **Vite 8** bundler, **React Router 7** for routing
- **ESLint** with react-hooks and react-refresh plugins
- `no-unused-vars` ignores uppercase and underscore-prefixed variables
- **Resource-driven UI**: `frontend/src/config/resources.js` defines entities; generic components render CRUD pages automatically
- Custom page overrides are registered in `App.jsx` via `pageOverrides` map
- API client auto-generates CRUD functions from the resource config — also exports named functions for backward compatibility
- MSAL-based auth with Entra ID; `VITE_AUTH_DISABLED=true` disables auth in dev/tests
- Vitest unit tests go in `src/**/*.test.{js,jsx}`; Playwright E2E tests go in `e2e/`

### Database

- Dual-database support: SQLite (local dev, docker-compose) and PostgreSQL (k8s production)
- `DATABASE_URL` env var takes priority; falls back to `DATABASE_PATH` for SQLite
- SQLite: tables created via `Base.metadata.create_all` on startup
- PostgreSQL: Alembic migrations run on startup
- Seeding is idempotent — only runs if the first resource table is empty

## 6. Change Guidelines

- Add or update backend tests in `tests/` for any new endpoint or behavior change
- Add or update Playwright E2E tests in `frontend/e2e/` for user-facing changes
- Add Vitest unit tests in `src/**/*.test.js` for new frontend logic/hooks
- When adding a new entity:
  1. Add model in `resources/models.py`
  2. Add schemas in `resources/schemas.py`
  3. Register in `resources/config.py`
  4. Add frontend config in `frontend/src/config/resources.js`
  5. Create Alembic migration: `uv run alembic revision --autogenerate -m "add <entity>"`
  6. Update seed data in `base_data_import/glossary-seed.json` if applicable
- Re-export new models/schemas in `app/models.py` and `app/schemas.py` for backward compatibility
- Backward compatibility: named export functions in `frontend/src/api/client.js` must be preserved (or updated across all call sites)

## 7. Constraints & Do-Not-Touch Areas

### Generic Framework (modify with extreme caution)

These files form the reusable CRUD framework. Changes here affect all resources:

- `app/crud/router_factory.py` — auto-generates CRUD routers
- `app/crud/nested_router.py` — auto-generates nested child routers
- `app/crud/backup.py` — generic backup/restore
- `app/crud/seed.py` — generic seeding
- `app/crud/registry.py` — ResourceConfig/ChildResourceConfig dataclasses
- `app/main.py` — app factory, auto-registration loop
- `app/auth.py` — JWT validation (security-sensitive)
- `app/database.py` — engine configuration
- `frontend/src/api/client.js` — generic API client
- `frontend/src/components/Crud*.jsx` — generic CRUD components
- `frontend/src/App.jsx` — generic route generation

### Do Not Modify

- `alembic/versions/` — existing migration files are immutable; only add new ones
- `base_data_import/glossary-seed.json` — only append; do not restructure without testing seed idempotency
- `.github/workflows/` — reusable CI workflow files; changes affect all downstream repos
- `.woodpecker/` — CD pipelines with secret references; test in staging first
- `k8s/` — Kubernetes manifests use template placeholders (`__APP_NAME__`, `__NAMESPACE__`, etc.); preserve placeholder format
- `uv.lock` — do not manually edit; regenerated by `uv sync`
- `frontend/package-lock.json` — do not manually edit; regenerated by `npm install`

### Security-Sensitive

- `app/auth.py` — JWT validation, JWKS cache, role/scope enforcement
- `frontend/src/auth/` — MSAL configuration, token acquisition
- `.env` files — never commit; `.env` is in `.gitignore`

## 8. Environment & Secrets

### Backend (.env)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | No | *(none)* | PostgreSQL connection string (takes priority) |
| `DATABASE_PATH` | No | `./dictionary.db` | SQLite file path (fallback) |
| `OPENAI_API_KEY` | No | *(none)* | OpenAI API key for definition recommendations |
| `OPENAI_RECOMMENDATION_MODEL` | No | `gpt-4.1-mini` | Model for recommendations |
| `OPENAI_API_URL` | No | `https://api.openai.com/v1/chat/completions` | OpenAI endpoint override |
| `AUTH_DISABLED` | No | `false` | Set `true` to skip JWT validation (dev only) |
| `TENANT_ID` | Yes (if auth enabled) | — | Microsoft Entra tenant ID |
| `API_AUDIENCE` | Yes (if auth enabled) | — | Entra app audience URI |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173,http://localhost:8000` | Comma-separated CORS origins |

### Frontend (build-time)

| Variable | Purpose |
|---|---|
| `VITE_CLIENT_ID` | Entra app client ID |
| `VITE_TENANT_ID` | Entra tenant ID |
| `VITE_API_SCOPE` | API scope for token requests |
| `VITE_AUTH_DISABLED` | Set `true` to disable auth in frontend |
| `VITE_API_URL` | API base URL override (empty = same origin) |

### Secret Handling

- Copy `.env.example` to `.env` for local development
- `.env` is gitignored — never commit secrets
- Docker build-args (`VITE_CLIENT_ID`, `VITE_TENANT_ID`, `VITE_API_SCOPE`) are baked into the frontend at build time
- Kubernetes secrets are managed via Woodpecker pipelines and kubectl

## 9. Area-Specific Instructions

### `resources/` — Domain Layer

This is where domain-specific changes go. When adding a new entity:
- Model must inherit from `app.models.Base`
- Use SQLAlchemy 2 `Mapped[]` / `mapped_column()` syntax
- Schemas use Pydantic v2 with `model_config = {"from_attributes": True}` on read schemas
- Register in `resources/config.py` using `ResourceConfig` / `ChildResourceConfig`
- Custom routers are standard FastAPI `APIRouter` instances

### `frontend/src/config/resources.js` — Frontend Domain Config

- Defines field types, labels, form behavior, list rendering
- `navOrder` controls navigation bar ordering
- `pageOverrides` in `App.jsx` maps resource names to custom page components
- Generic components read this config — avoid hardcoding resource-specific logic in generic components

### `tests/` — Backend Tests

- Use the `client` fixture for HTTP-level tests (overrides DB to in-memory SQLite, bypasses auth)
- Use `seed_categories` and `seed_term` fixtures for common test data
- Test files follow `test_<resource>.py` naming
- All tests run async (pytest-asyncio auto mode)

### `frontend/e2e/` — E2E Tests

- Playwright with Chromium only
- `helpers.js` contains shared test utilities
- Backend must be running on port 8000; Playwright auto-starts the frontend dev server
- Auth is disabled via `VITE_AUTH_DISABLED=true` in Playwright config

### `alembic/` — Database Migrations

- `env.py` reads `DATABASE_URL` from `app.database` — do not hardcode connection strings
- Migrations only apply to PostgreSQL deployments; SQLite uses `create_all`
- Never modify existing migration files; always create new revisions
- After changing models in `resources/models.py`, generate a migration before committing
