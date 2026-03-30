# ── Stage 1: Build the React frontend ──────────────────────────────
# Pin to the build host platform so npm ci never runs under QEMU.
# The output is static HTML/JS/CSS and is platform-independent.
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./

# Auth env vars are baked into the frontend at build time.
# Pass these as --build-arg when building for production.
ARG VITE_CLIENT_ID=""
ARG VITE_TENANT_ID=""
ARG VITE_API_SCOPE=""

# Build metadata — injected by CI/CD or docker build.
ARG VITE_BUILD_COMMIT=""
ARG VITE_BUILD_TAG=""
ARG VITE_BUILD_BRANCH=""
ARG VITE_BUILD_TIME=""

RUN npm run build

# ── Stage 2: Python runtime with FastAPI + built frontend ─────────
FROM python:3.12-slim AS runtime
WORKDIR /app

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev --no-install-project

# Copy application code
COPY app/ app/
COPY resources/ resources/
COPY base_data_import/ base_data_import/

# Copy Alembic configuration and migrations
COPY alembic.ini ./
COPY alembic/ alembic/

# Copy built frontend into the static directory
COPY --from=frontend-build /build/dist static/

# Create a directory for the SQLite database (used when DATABASE_URL is not set)
RUN mkdir -p /data

# Database configuration:
#   - Set DATABASE_URL for PostgreSQL (e.g. postgresql://user:pass@host/db)
#   - Falls back to SQLite at DATABASE_PATH when DATABASE_URL is not set
ENV DATABASE_PATH=/data/dictionary.db

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
