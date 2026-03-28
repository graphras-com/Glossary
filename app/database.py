import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _build_database_url() -> str:
    """Determine the async database URL from environment variables.

    Priority:
      1. DATABASE_URL  - full connection string (PostgreSQL or SQLite)
      2. DATABASE_PATH - path to a SQLite file (legacy / local-dev default)

    When DATABASE_URL starts with ``postgresql://`` it is rewritten to
    ``postgresql+asyncpg://`` so users can paste a standard libpq URI.
    """
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        # Accept standard postgres:// or postgresql:// and convert to asyncpg
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    # Fallback: SQLite via aiosqlite (local dev / docker-compose)
    db_path = Path(
        os.environ.get(
            "DATABASE_PATH", Path(__file__).resolve().parent.parent / "dictionary.db"
        )
    )
    return f"sqlite+aiosqlite:///{db_path}"


DATABASE_URL = _build_database_url()

_is_sqlite = DATABASE_URL.startswith("sqlite")

# Engine options differ between SQLite and PostgreSQL
_engine_kwargs: dict = {"echo": False}
if not _is_sqlite:
    _engine_kwargs.update(
        {
            "pool_size": 5,
            "max_overflow": 10,
            "pool_pre_ping": True,
        }
    )

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def is_sqlite() -> bool:
    """Return True when the app is running against SQLite."""
    return _is_sqlite


async def get_db():
    async with async_session() as session:
        yield session
