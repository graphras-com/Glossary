"""Application resource configuration — the single source of truth.

This file registers all CRUD resources with the generic framework.
When creating a new application, modify this file to define your
domain entities and their relationships.
"""

from __future__ import annotations

from pathlib import Path

from app.crud.registry import ChildResourceConfig, ResourceConfig, ResourceRegistry
from resources.models import CategoryModel, DefinitionModel, TermModel
from resources.schemas import (
    BackupCategory,
    BackupTerm,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    DefinitionCreate,
    DefinitionRead,
    DefinitionUpdate,
    TermCreate,
    TermRead,
    TermUpdate,
)

# ---------------------------------------------------------------------------
# Application metadata
# ---------------------------------------------------------------------------

APP_TITLE = "Dictionary API"
APP_VERSION = "0.1.0"

# Role required for destructive operations (backup restore)
ADMIN_ROLE = "Glossary.Admin"

# Seed data file
SEED_FILE = (
    Path(__file__).resolve().parent.parent / "base_data_import" / "glossary-seed.json"
)

# ---------------------------------------------------------------------------
# Resource definitions
# ---------------------------------------------------------------------------

registry = ResourceRegistry()

# -- Categories (self-referencing hierarchy) --------------------------------

registry.register(
    ResourceConfig(
        name="categories",
        model=CategoryModel,
        create_schema=CategoryCreate,
        read_schema=CategoryRead,
        update_schema=CategoryUpdate,
        pk_field="id",
        pk_type=str,
        order_by="id",
        unique_fields=["id"],
        fk_validations={"parent_id": CategoryModel},
        protect_on_delete=True,
        label="Categories",
        label_singular="Category",
        backup_schema=BackupCategory,
        self_referencing_fk="parent_id",
    )
)

# -- Terms (with nested definitions) ---------------------------------------

registry.register(
    ResourceConfig(
        name="terms",
        model=TermModel,
        create_schema=TermCreate,
        read_schema=TermRead,
        update_schema=TermUpdate,
        pk_field="id",
        pk_type=int,
        order_by="term",
        unique_fields=["term"],
        searchable_fields=["term"],
        filterable_fks={"category": "definitions.category_id"},
        label="Terms",
        label_singular="Term",
        backup_schema=BackupTerm,
        backup_children_field="definitions",
        children=[
            ChildResourceConfig(
                name="definitions",
                model=DefinitionModel,
                create_schema=DefinitionCreate,
                read_schema=DefinitionRead,
                update_schema=DefinitionUpdate,
                pk_field="id",
                pk_type=int,
                parent_fk="term_id",
                fk_validations={"category_id": CategoryModel},
                label="Definitions",
                label_singular="Definition",
            )
        ],
    )
)

# ---------------------------------------------------------------------------
# Custom routers (domain-specific endpoints beyond generic CRUD)
# ---------------------------------------------------------------------------

# Import custom routers lazily to avoid circular imports.  Each custom
# router is a standard FastAPI APIRouter.
CUSTOM_ROUTERS: list = []


def _load_custom_routers():
    """Load application-specific routers that aren't auto-generated."""
    from resources.routers import extract_glossary, recommend

    return [recommend.router, extract_glossary.router]
