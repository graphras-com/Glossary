"""SQLAlchemy declarative base and model re-exports.

The :class:`Base` class lives here so the generic framework (database,
alembic, tests) can import it without depending on application-specific
code.  The concrete model classes are defined in :mod:`resources.models`
and re-exported here for backward compatibility.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Re-export application models so existing imports continue to work.
# When creating a new application, update these imports to point to
# your own models in resources/models.py.
from resources.models import (  # noqa: E402, F401
    CategoryModel,
    DefinitionModel,
    TermModel,
)
