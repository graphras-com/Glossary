"""FastAPI application factory.

This module is **generic** — it reads the resource registry from
:mod:`resources.config` and auto-generates all CRUD routers.  When
creating a new application from the template, you should not need to
modify this file.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from alembic import command
from app.crud.backup import create_backup_router
from app.crud.nested_router import create_nested_crud_router
from app.crud.router_factory import create_crud_router
from app.crud.seed import seed_from_file
from app.database import async_session, engine, is_sqlite
from app.models import Base
from resources.config import (
    ADMIN_ROLE,
    APP_TITLE,
    APP_VERSION,
    SEED_FILE,
    _load_custom_routers,
    registry,
)

logger = logging.getLogger(__name__)

# Resolved path to the frontend build output (populated by Docker build or manual build)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# CORS origins: comma-separated list from env, with sensible defaults for dev
_cors_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
CORS_ORIGINS: list[str] = (
    [o.strip() for o in _cors_env.split(",") if o.strip()]
    if _cors_env
    else ["http://localhost:5173", "http://localhost:8000"]
)

# Path to alembic.ini (lives at the project root)
ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


_MIGRATION_MAX_RETRIES = int(os.getenv("MIGRATION_MAX_RETRIES", "12"))
_MIGRATION_RETRY_INTERVAL = int(os.getenv("MIGRATION_RETRY_INTERVAL", "5"))


def _run_migrations_sync() -> None:
    """Run Alembic migrations in a fresh event loop (called from a thread)."""
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")


async def _run_migrations() -> None:
    """Run Alembic migrations in a separate thread with retries.

    Alembic's async env.py calls asyncio.run() which requires its own event
    loop.  Running in a thread avoids the "cannot call asyncio.run() from a
    running event loop" error when called from uvicorn's lifespan.

    Retries are essential for Kubernetes deployments where the database
    (e.g. CloudNativePG) may not be ready when the pod starts.
    """
    loop = asyncio.get_running_loop()
    for attempt in range(1, _MIGRATION_MAX_RETRIES + 1):
        try:
            await loop.run_in_executor(None, _run_migrations_sync)
            return
        except Exception:
            if attempt == _MIGRATION_MAX_RETRIES:
                logger.error(
                    "Database migration failed after %d attempts — giving up",
                    _MIGRATION_MAX_RETRIES,
                )
                raise
            logger.warning(
                "Database migration attempt %d/%d failed, retrying in %ds …",
                attempt,
                _MIGRATION_MAX_RETRIES,
                _MIGRATION_RETRY_INTERVAL,
            )
            await asyncio.sleep(_MIGRATION_RETRY_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations (works for both SQLite and PostgreSQL).
    # For SQLite in local dev, this also creates the tables on first run.
    if is_sqlite():
        # SQLite: use create_all for simplicity (no migration history needed locally)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        # PostgreSQL: run Alembic migrations for proper schema management
        logger.info("Running Alembic migrations …")
        await _run_migrations()

    async with async_session() as db:
        await seed_from_file(db, registry, SEED_FILE)
    yield
    await engine.dispose()


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# --- Auto-register CRUD routers from the resource registry ----------------
for resource_config in registry.resources:
    crud_router = create_crud_router(resource_config)
    app.include_router(crud_router)
    for child_config in resource_config.children:
        nested_router = create_nested_crud_router(resource_config, child_config)
        app.include_router(nested_router)

# --- Backup / Restore router (generic) -----------------------------------
backup_router = create_backup_router(registry, admin_role=ADMIN_ROLE)
app.include_router(backup_router)

# --- Custom (domain-specific) routers ------------------------------------
for custom_router in _load_custom_routers():
    app.include_router(custom_router)


@app.get("/health", tags=["health"])
async def health():
    """Unauthenticated health check for Kubernetes probes."""
    return {"status": "ok"}


# --- Serve frontend SPA (only when the static dir exists) ---
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
