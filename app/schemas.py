"""Pydantic schema re-exports for backward compatibility.

Concrete schemas are defined in :mod:`resources.schemas`.  This module
re-exports them so that existing imports (``from app.schemas import ...``)
continue to work without changes.
"""

from resources.schemas import (  # noqa: F401
    BackupCategory,
    BackupDefinition,
    BackupPayload,
    BackupTerm,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    DefinitionCreate,
    DefinitionRead,
    DefinitionRecommendRequest,
    DefinitionRecommendResponse,
    DefinitionUpdate,
    GlossaryExtractRequest,
    TermCreate,
    TermRead,
    TermUpdate,
)
