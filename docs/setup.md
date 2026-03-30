# Setup

## Prerequisites

- **Python 3.11+** with [uv](https://docs.astral.sh/uv/) package manager
- **Node.js 22+** with npm
- **Docker + Docker Compose** (optional, for containerized deployment)

## Local Development

### 1. Clone and Configure

```bash
git clone <repository-url>
cd Glossary
cp .env.example .env
```

Edit `.env` as needed. The defaults work for local development with auth disabled:

```env
AUTH_DISABLED=true
DATABASE_PATH=./dictionary.db
```

### 2. Start the Backend

```bash
# Install Python dependencies
uv sync

# Start the API server on port 8000
uv run uvicorn app.main:app --reload --port 8000
```

On first launch, the SQLite database file (`dictionary.db`) is created automatically and seeded with 18 telecom categories and 165 terms from `base_data_import/glossary-seed.json`.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on <http://localhost:5173> and proxies API calls (`/categories`, `/terms`, `/backup`, `/health`) to `http://localhost:8000`.

### Docker Compose

For a containerized setup:

```bash
docker compose up --build -d
```

This builds a multi-stage Docker image (Node.js for the frontend, Python for the backend), and serves the app at <http://localhost:5173> (host port 5173 mapped to container port 8000). The SQLite database is persisted in a Docker named volume (`glossary-data`).

To use auth with Docker Compose, configure the build args in `docker-compose.yml` and set the appropriate environment variables in `.env`.

### Verify Installation

```bash
# Health check
curl http://localhost:8000/health
# Should return: {"status":"ok"}

# List categories (auth disabled)
curl http://localhost:8000/categories/
```

## IDE Setup

### VS Code

The repository includes `.vscode/settings.json` with recommended settings. Key configurations:

- Python formatter: Ruff
- Python linter: Ruff
- `pythonPath`: Points to the `.venv` directory

### Recommended Extensions

- Python (ms-python.python)
- Ruff (charliermarsh.ruff)
- ESLint (dbaeumer.vscode-eslint)
- Playwright Test (ms-playwright.playwright)
