# Glossary

A full-stack bilingual telecom glossary application for browsing, searching, and managing telecommunications terminology with English and Danish definitions, organized into hierarchical categories.

## Features

- **Bilingual definitions** -- every term supports English (required) and Danish (optional) definitions
- **Hierarchical categories** -- dot-notation taxonomy (e.g. `network.mobile`) with breadcrumb display
- **Search and filter** -- real-time text search by term name with category dropdown filter
- **PDF export** -- generates an A4 glossary PDF with a clickable letter index, grouped headings, and bilingual definitions
- **Backup and restore** -- download the entire database as JSON or upload a JSON file to restore it
- **Full CRUD** -- create, read, update, and delete terms, definitions, and categories
- **Seed data** -- ships with 18 telecom categories and 165 terms covering concepts like LTE, SIM Card, Backhaul, MPLS, and more

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Backend   | Python 3.11+, FastAPI, SQLAlchemy 2 (async), SQLite |
| Frontend  | React 19, React Router 7, Vite 8                    |
| PDF       | jsPDF + jspdf-autotable                              |
| Testing   | pytest, Vitest, Playwright                           |
| Packaging | uv (Python), npm (Node)                              |
| Container | Docker (multi-stage) + Docker Compose                |

## Project Structure

```
.
├── app/                        # FastAPI backend
│   ├── main.py                 # App entrypoint, lifespan, middleware
│   ├── database.py             # Async SQLAlchemy engine + session
│   ├── models.py               # ORM models (Category, Term, Definition)
│   ├── schemas.py              # Pydantic request/response schemas
│   ├── seed.py                 # Auto-seeds DB from glossary-seed.json
│   └── routers/
│       ├── categories.py       # /categories endpoints
│       ├── terms.py            # /terms + /terms/{id}/definitions endpoints
│       └── backup.py           # /backup and /backup/restore endpoints
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── api/client.js       # Fetch-based API client
│   │   ├── pages/              # Route pages (Home, TermList, CategoryList, etc.)
│   │   ├── components/         # Shared UI components
│   │   ├── hooks/              # Custom React hooks
│   │   └── pdf/                # Client-side PDF generation
│   └── e2e/                    # Playwright end-to-end tests
├── base_data_import/           # glossary-seed.json seed data
├── tests/                      # Backend pytest suite
├── Dockerfile                  # Multi-stage build (Node + Python)
├── docker-compose.yml          # Single-service compose with volume
└── pyproject.toml              # Python project config and tooling
```

## Getting Started

### Prerequisites

- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 22+ with npm
- Docker + Docker Compose (for containerized deployment)

### Local Development

**Backend:**

```bash
# Install Python dependencies
uv sync

# Start the API server on port 8000
uv run uvicorn app.main:app --reload --port 8000
```

The database is created automatically on first launch and seeded with the telecom glossary data.

**Frontend:**

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server on port 5173 (proxies API calls to port 8000)
npm run dev
```

Open <http://localhost:5173> to use the app in development mode.

### Docker

```bash
# Build and start the container
docker compose up --build -d
```

The app is served at <http://localhost:8000>. The SQLite database is persisted in a Docker named volume (`glossary-data`).

## API Endpoints

| Method   | Path                                | Description                        |
|----------|-------------------------------------|------------------------------------|
| `GET`    | `/health`                           | Health check                       |
| `GET`    | `/categories/`                      | List all categories                |
| `GET`    | `/categories/{id}`                  | Get a single category              |
| `POST`   | `/categories/`                      | Create a category                  |
| `PATCH`  | `/categories/{id}`                  | Update a category                  |
| `DELETE` | `/categories/{id}`                  | Delete a category                  |
| `GET`    | `/terms/`                           | List terms (`?q=` search, `?category=` filter) |
| `GET`    | `/terms/{id}`                       | Get a term with its definitions    |
| `POST`   | `/terms/`                           | Create a term with definitions     |
| `PATCH`  | `/terms/{id}`                       | Update a term name                 |
| `DELETE` | `/terms/{id}`                       | Delete a term and its definitions  |
| `POST`   | `/terms/{id}/definitions`           | Add a definition to a term         |
| `PATCH`  | `/terms/{id}/definitions/{def_id}`  | Update a definition                |
| `DELETE` | `/terms/{id}/definitions/{def_id}`  | Delete a definition                |
| `GET`    | `/backup/`                          | Export all data as JSON            |
| `POST`   | `/backup/restore`                   | Replace all data from JSON upload  |

## Data Model

```
Category (string ID, dot-notation)
  └── parent_id → Category (self-referencing hierarchy)

Term (integer ID, unique name)
  └── Definition (integer ID)
        ├── text_en (required)
        ├── text_da (optional)
        └── category_id → Category
```

A term can have multiple definitions, each belonging to a different category.

## Environment Variables

| Variable        | Default                            | Description                |
|-----------------|------------------------------------|----------------------------|
| `DATABASE_PATH` | `./dictionary.db` (local), `/data/dictionary.db` (Docker) | Path to SQLite database |

## Testing

**Backend:**

```bash
# Run the full backend test suite (~68 tests)
uv run pytest
```

**Frontend unit tests:**

```bash
cd frontend
npm run test:unit
```

**Frontend end-to-end tests** (requires backend and frontend running):

```bash
cd frontend
npm run test           # headless
npm run test:headed    # with visible browser
```

## Linting

```bash
# Python (ruff)
uv run ruff check .
uv run ruff format .

# JavaScript (eslint)
cd frontend && npm run lint
```

## k3s Deploy (Woodpecker + Traefik)

The repository includes two Woodpecker pipeline files:

- `.woodpecker/deploy-staging.yml` for staging
- `.woodpecker/deploy-production.yml` for production releases

- `main` branch push/manual deploys to namespace `glossary-staging` at `staging-glossary.graphras.com`
- tag builds (release tags) deploy to namespace `glossary-production` at `glossary.graphras.com`

If your Woodpecker repo is configured with a single custom config path, make sure both pipeline files are loaded (or update the config setting accordingly).

Kubernetes manifests are split by environment:

- `k8s/staging/` for staging
- `k8s/production/` for production

### Required Woodpecker Secrets

- `KUBECONFIG_B64` -- base64-encoded kubeconfig with access to the k3s cluster
- `GHCR_USERNAME` -- GitHub username (or robot user) with pull access
- `GHCR_TOKEN` -- GitHub token with `read:packages`

Image behavior:

- Staging deploys `ghcr.io/graphras-com/glossary:main` and forces a rollout restart.
- Production deploys tag image `ghcr.io/graphras-com/glossary:${CI_COMMIT_TAG}`.

### TLS Note

Ingress expects these TLS secrets:

- `staging-glossary-graphras-com-tls` in namespace `glossary-staging`
- `glossary-graphras-com-tls` in namespace `glossary-production`

If you use cert-manager, issue these secrets from your ClusterIssuer; otherwise create them manually.
