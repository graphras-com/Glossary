# ── Stage 1: Build the React frontend ──────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime with FastAPI + built frontend ─────────
FROM python:3.14-slim AS runtime
WORKDIR /app

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project 2>/dev/null || uv sync --no-dev --no-install-project

# Copy application code
COPY app/ app/
COPY base_data_import/ base_data_import/

# Copy built frontend into the static directory
COPY --from=frontend-build /build/dist static/

# Create a directory for the SQLite database (can be mounted as a volume)
RUN mkdir -p /data
ENV DATABASE_PATH=/data/dictionary.db

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
