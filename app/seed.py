"""Backward-compatible seed wrapper.

The actual seeding logic now lives in :mod:`app.crud.seed` and uses the
resource registry.  This module re-exports the old interface so that
existing tests (``from app.seed import seed, SEED_FILE``) continue to
work.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.seed import seed_from_file
from resources.config import SEED_FILE, registry

# Re-export for backward compatibility
__all__ = ["SEED_FILE", "seed"]


async def seed(db: AsyncSession) -> None:
    """Seed the database using the application's configured seed file."""
    await seed_from_file(db, registry, SEED_FILE)
