"""Resource registry — the central declaration point for CRUD resources.

Each resource is described by a :class:`ResourceConfig` dataclass.  Child
(nested) resources are described by :class:`ChildResourceConfig`.  The
:class:`ResourceRegistry` collects all configs and exposes helpers used
by the router factory, backup module and seed module.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel
from sqlalchemy.orm import DeclarativeBase


@dataclass
class ChildResourceConfig:
    """Config for a child resource nested under a parent (e.g. definitions under terms)."""

    name: str
    """URL path segment and tag, e.g. ``"definitions"``."""

    model: type[DeclarativeBase]
    """SQLAlchemy model class."""

    create_schema: type[BaseModel]
    read_schema: type[BaseModel]
    update_schema: type[BaseModel]

    pk_field: str = "id"
    """Name of the primary-key column on the child model."""

    pk_type: type = int
    """Python type of the primary key (``int`` or ``str``)."""

    parent_fk: str = ""
    """Column on the child model that references the parent PK, e.g. ``"term_id"``."""

    fk_validations: dict[str, type[DeclarativeBase]] = field(default_factory=dict)
    """Mapping of child fields to model classes that must exist.

    Example: ``{"category_id": CategoryModel}`` — before creating or
    updating a child row the framework will verify the referenced category
    exists and return 422 otherwise.
    """

    label: str = ""
    """Human-readable plural label (defaults to capitalised *name*)."""

    label_singular: str = ""
    """Human-readable singular label."""


@dataclass
class ResourceConfig:
    """Declarative configuration for a top-level CRUD resource."""

    name: str
    """URL prefix and tag, e.g. ``"categories"`` → ``/categories``."""

    model: type[DeclarativeBase]
    """SQLAlchemy model class."""

    create_schema: type[BaseModel]
    read_schema: type[BaseModel]
    update_schema: type[BaseModel]

    pk_field: str = "id"
    pk_type: type = int

    order_by: str = ""
    """Column name used for default ordering in list endpoint.
    Empty string means no explicit ordering.
    """

    unique_fields: list[str] = field(default_factory=list)
    """Fields that must be unique.  The framework checks before create/update
    and returns 409 on duplicates.
    """

    searchable_fields: list[str] = field(default_factory=list)
    """Fields searched by the ``?q=`` query parameter (case-insensitive
    substring match via ``icontains``).
    """

    filterable_fks: dict[str, str] = field(default_factory=dict)
    """Query-parameter filters through child relationships.

    Keys are query-param names, values are ``"ChildModel.column"`` dot-paths.
    Example: ``{"category": "definitions.category_id"}`` enables
    ``GET /terms?category=network``.
    """

    fk_validations: dict[str, type[DeclarativeBase]] = field(default_factory=dict)
    """Same semantics as :attr:`ChildResourceConfig.fk_validations`."""

    protect_on_delete: bool = False
    """When True, catch ``IntegrityError`` on delete and return 409
    instead of letting the DB error propagate.
    """

    children: list[ChildResourceConfig] = field(default_factory=list)
    """Nested child resources that get ``/{parent_pk}/child/...`` routes."""

    label: str = ""
    """Human-readable plural label."""

    label_singular: str = ""

    # --- Backup/restore helpers -------------------------------------------------

    backup_schema: type[BaseModel] | None = None
    """Optional Pydantic model used for serialising the resource in backups.
    Falls back to *read_schema* when ``None``.
    """

    backup_children_field: str = ""
    """When set, backup serialisation nests child rows under this field
    on each parent record.  Example: ``"definitions"`` on the terms
    resource means each backup term carries its definitions inline.
    """

    self_referencing_fk: str = ""
    """Column name of a self-referencing FK (e.g. ``"parent_id"`` on
    categories).  The backup restore performs topological insertion to
    respect this constraint.
    """


class ResourceRegistry:
    """Singleton-style registry that collects all resource configs."""

    def __init__(self) -> None:
        self._resources: list[ResourceConfig] = []
        self._by_name: dict[str, ResourceConfig] = {}

    def register(self, config: ResourceConfig) -> None:
        if config.name in self._by_name:
            raise ValueError(f"Resource '{config.name}' is already registered")
        self._resources.append(config)
        self._by_name[config.name] = config

    def get(self, name: str) -> ResourceConfig:
        return self._by_name[name]

    @property
    def resources(self) -> Sequence[ResourceConfig]:
        return list(self._resources)

    def all_models(self) -> list[type[DeclarativeBase]]:
        """Return all registered model classes (parents + children) in
        registration order."""
        models: list[type[DeclarativeBase]] = []
        for r in self._resources:
            models.append(r.model)
            for c in r.children:
                if c.model not in models:
                    models.append(c.model)
        return models

    def find_resource_for_model(
        self, model: type[DeclarativeBase]
    ) -> ResourceConfig | None:
        """Look up the :class:`ResourceConfig` whose *model* matches."""
        for r in self._resources:
            if r.model is model:
                return r
        return None

    def find_child_for_model(
        self, model: type[DeclarativeBase]
    ) -> tuple[ResourceConfig, ChildResourceConfig] | None:
        for r in self._resources:
            for c in r.children:
                if c.model is model:
                    return r, c
        return None
