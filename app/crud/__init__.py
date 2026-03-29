"""Generic CRUD engine for FastAPI + SQLAlchemy.

Provides a registry-based approach to auto-generate CRUD API endpoints
from SQLAlchemy models and Pydantic schemas.  Application-specific code
only needs to define models, schemas and a :class:`ResourceConfig` for
each entity.
"""

from app.crud.registry import ChildResourceConfig, ResourceConfig, ResourceRegistry

__all__ = [
    "ChildResourceConfig",
    "ResourceConfig",
    "ResourceRegistry",
]
