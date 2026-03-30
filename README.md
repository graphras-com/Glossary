[![status-badge](https://ci.graphras.com/api/badges/1/status.svg?events=push%2Ctag%2Crelease%2Cpull_request%2Cdeployment%2Cmanual)](https://ci.graphras.com/repos/1)

# Glossary

A full-stack bilingual telecom glossary application for browsing, searching, and managing telecommunications terminology with English and Danish definitions, organized into hierarchical categories.

Built on a **generic CRUD framework** -- domain entities are declared in configuration files and the framework auto-generates backend routers, API client functions, and frontend pages.

## Features

- **Bilingual definitions** -- every term supports English (required) and Danish (optional) definitions
- **Hierarchical categories** -- dot-notation taxonomy (e.g. `network.mobile`) with parent-child relationships
- **Search and filter** -- real-time text search by term name with category dropdown filter
- **AI-powered recommendations** -- generate English and Danish definition suggestions via OpenAI
- **Glossary extraction** -- find existing glossary terms in free text (word-boundary matching)
- **PDF export** -- generate an A4 glossary PDF with a clickable letter index, grouped headings, and bilingual definitions
- **Backup and restore** -- download the entire database as JSON or upload a JSON file to restore it
- **Full CRUD** -- create, read, update, and delete terms, definitions, and categories
- **Microsoft Entra ID authentication** -- OIDC + OAuth 2.0 with PKCE, RBAC roles, and JWT validation
- **Seed data** -- ships with 18 telecom categories and 165 terms

## Tech Stack

| Layer      | Technology                                               |
|------------|----------------------------------------------------------|
| Backend    | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Pydantic v2 |
| Database   | SQLite (local dev / Docker) or PostgreSQL (production)   |
| Frontend   | React 19, React Router 7, Vite 8                        |
| Auth       | Microsoft Entra ID (MSAL.js + PyJWT)                    |
| PDF        | jsPDF + jspdf-autotable (client-side)                    |
| Testing    | pytest (125 tests), Vitest, Playwright                   |
| Packaging  | uv (Python), npm (Node)                                  |
| Container  | Docker (multi-stage, multi-platform) + Docker Compose    |
| CI/CD      | GitHub Actions + Woodpecker CI                           |
| Deployment | Kubernetes (k3s) with Traefik + CloudNativePG            |

## Quick Start

### Prerequisites

- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 22+ with npm

### Backend

```bash
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

The database is created automatically on first launch and seeded with telecom glossary data.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies API calls to port 8000.

### Docker

```bash
docker compose up --build -d
```

The app is served at <http://localhost:5173> (mapped from container port 8000). The SQLite database is persisted in a Docker named volume.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, generic CRUD framework, data model |
| [Setup](docs/setup.md) | Installation and local development |
| [Configuration](docs/configuration.md) | Environment variables reference |
| [API](docs/api.md) | REST API endpoints and data model |
| [Authentication](docs/authentication.md) | Microsoft Entra ID setup and auth flows |
| [Development](docs/development.md) | Coding conventions, adding entities, linting |
| [Testing](docs/testing.md) | Backend, frontend unit, and E2E testing |
| [Deployment](docs/deployment.md) | Docker, Kubernetes, CI/CD pipelines |

## License

Internal project -- see repository access settings.
