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
from app.database import async_session, engine, is_sqlite
from app.models import Base
from app.routers import backup, categories, terms
from app.seed import seed

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


def _run_migrations_sync() -> None:
    """Run Alembic migrations in a fresh event loop (called from a thread)."""
    cfg = Config(str(ALEMBIC_INI))
    command.upgrade(cfg, "head")


async def _run_migrations() -> None:
    """Run Alembic migrations in a separate thread.

    Alembic's async env.py calls asyncio.run() which requires its own event
    loop.  Running in a thread avoids the "cannot call asyncio.run() from a
    running event loop" error when called from uvicorn's lifespan.
    """
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run_migrations_sync)


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
        await seed(db)
    yield
    await engine.dispose()


app = FastAPI(title="Dictionary API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(categories.router)
app.include_router(terms.router)
app.include_router(backup.router)


@app.get("/health", tags=["health"])
async def health():
    """Unauthenticated health check for Kubernetes probes."""
    return {"status": "ok"}


# --- Serve frontend SPA (only when the static dir exists) ---
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
