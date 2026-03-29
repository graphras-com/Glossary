"""Auto-generate a full set of CRUD endpoints for a :class:`ResourceConfig`.

Usage::

    from app.crud.router_factory import create_crud_router
    router = create_crud_router(config)
    app.include_router(router)

Generates the following endpoints:

- ``GET  /{name}/``          — list (with optional ``?q=`` search and FK filters)
- ``GET  /{name}/{pk}``      — get by primary key
- ``POST /{name}/``          — create
- ``PATCH /{name}/{pk}``     — partial update
- ``DELETE /{name}/{pk}``    — delete
"""

from __future__ import annotations

import inspect
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_auth
from app.crud.registry import ResourceConfig
from app.database import get_db


def _get_model_attr(model: type, field: str):
    """Return the mapped attribute on *model* for the given field name."""
    return getattr(model, field)


def _has_relationship(model: type, rel_name: str) -> bool:
    """Check whether the SQLAlchemy model has a relationship called *rel_name*."""
    from sqlalchemy import inspect as sa_inspect

    try:
        mapper = sa_inspect(model)
        return rel_name in mapper.relationships
    except Exception:
        return False


def _resolve_filter_path(model: type, dot_path: str):
    """Resolve a dot-separated path like ``"definitions.category_id"`` into
    a (relationship_name, column_name) tuple for building join + where.

    Returns a tuple or ``None`` for a direct column filter.
    """
    parts = dot_path.split(".", 1)
    if len(parts) == 2:
        rel_name, col_name = parts
        return rel_name, col_name
    return None


def _make_create_endpoint(config: ResourceConfig, Model, pk_field):
    """Build the create endpoint with proper type annotation for FastAPI."""

    CreateSchema = config.create_schema

    async def create_item(body: Any = Body(...), db: AsyncSession = Depends(get_db)):
        data = body.model_dump()

        # Check uniqueness
        for uf in config.unique_fields:
            if uf in data and data[uf] is not None:
                if uf == pk_field:
                    existing = await db.get(Model, data[uf])
                else:
                    check = await db.execute(
                        select(Model).where(_get_model_attr(Model, uf) == data[uf])
                    )
                    existing = check.scalar_one_or_none()
                if existing:
                    name = config.label_singular or config.name.rstrip("s").title()
                    raise HTTPException(409, detail=f"{name} already exists")

        # Validate FK references
        for fk_field, fk_model in config.fk_validations.items():
            val = data.get(fk_field)
            if val is not None:
                ref = await db.get(fk_model, val)
                if not ref:
                    fk_label = fk_field.replace("_id", "").replace("_", " ").title()
                    raise HTTPException(
                        422,
                        detail=f"{fk_label} '{val}' not found",
                    )

        # Handle nested children creation (e.g., term + definitions)
        child_data_map: dict[str, list[dict]] = {}
        for child_cfg in config.children:
            child_field = child_cfg.name
            if child_field in data:
                child_rows = data.pop(child_field)
                if child_rows:
                    # Validate child FK references
                    for row in child_rows:
                        for cfk_field, cfk_model in child_cfg.fk_validations.items():
                            cfk_val = row.get(cfk_field)
                            if cfk_val is not None:
                                ref = await db.get(cfk_model, cfk_val)
                                if not ref:
                                    raise HTTPException(
                                        422,
                                        detail=f"Category '{cfk_val}' not found",
                                    )
                    child_data_map[child_field] = child_rows

        # Build parent model
        model_kwargs: dict[str, Any] = {}
        for key, val in data.items():
            if _has_relationship(Model, key):
                continue
            model_kwargs[key] = val

        # Create child model instances
        for child_field, rows in child_data_map.items():
            child_cfg_match = next(c for c in config.children if c.name == child_field)
            ChildModel = child_cfg_match.model
            model_kwargs[child_field] = [ChildModel(**row) for row in rows]

        item = Model(**model_kwargs)
        db.add(item)
        await db.commit()
        await db.refresh(item)
        return item

    # Patch the function signature so FastAPI sees the correct Pydantic type
    sig = inspect.signature(create_item)
    params = list(sig.parameters.values())
    new_params = []
    for p in params:
        if p.name == "body":
            new_params.append(
                p.replace(annotation=CreateSchema, default=inspect.Parameter.empty)
            )
        else:
            new_params.append(p)
    create_item.__signature__ = sig.replace(parameters=new_params)

    return create_item


def _make_update_handler(config: ResourceConfig, Model, pk_field):
    """Build the update logic (shared between int/str PK variants)."""

    async def _do_update(item_id: Any, body: Any, db: AsyncSession):
        options = []
        for child_cfg in config.children:
            rel_name = child_cfg.name
            if _has_relationship(Model, rel_name):
                options.append(selectinload(_get_model_attr(Model, rel_name)))

        item = await db.get(Model, item_id, options=options or None)
        if not item:
            name = config.label_singular or config.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{name} not found")

        updates = body.model_dump(exclude_unset=True)

        # Check uniqueness
        for uf in config.unique_fields:
            if uf in updates and uf != pk_field:
                check = await db.execute(
                    select(Model).where(
                        _get_model_attr(Model, uf) == updates[uf],
                        _get_model_attr(Model, pk_field) != item_id,
                    )
                )
                if check.scalar_one_or_none():
                    name = config.label_singular or config.name.rstrip("s").title()
                    raise HTTPException(
                        409,
                        detail=f"{name} '{updates[uf]}' already exists",
                    )

        # Validate FK references
        for fk_field, fk_model in config.fk_validations.items():
            if fk_field in updates and updates[fk_field] is not None:
                ref = await db.get(fk_model, updates[fk_field])
                if not ref:
                    fk_label = fk_field.replace("_id", "").replace("_", " ").title()
                    raise HTTPException(
                        422,
                        detail=f"{fk_label} '{updates[fk_field]}' not found",
                    )

        for key, value in updates.items():
            setattr(item, key, value)

        await db.commit()
        await db.refresh(item)
        return item

    return _do_update


def _make_update_endpoint(config: ResourceConfig, Model, pk_field, pk_type):
    """Build the update endpoint with proper type annotations."""

    UpdateSchema = config.update_schema
    _do_update = _make_update_handler(config, Model, pk_field)

    if pk_type is int:

        async def update_item(
            item_id: int,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_update(item_id, body, db)

    else:

        async def update_item(
            item_id: str,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_update(item_id, body, db)

    # Patch signature for FastAPI
    sig = inspect.signature(update_item)
    params = list(sig.parameters.values())
    new_params = []
    for p in params:
        if p.name == "body":
            new_params.append(
                p.replace(annotation=UpdateSchema, default=inspect.Parameter.empty)
            )
        else:
            new_params.append(p)
    update_item.__signature__ = sig.replace(parameters=new_params)

    return update_item


def create_crud_router(config: ResourceConfig) -> APIRouter:
    """Build and return an :class:`APIRouter` with full CRUD for *config*."""

    router = APIRouter(
        prefix=f"/{config.name}",
        tags=[config.name],
        dependencies=[Depends(require_auth)],
    )

    Model = config.model
    ReadSchema = config.read_schema
    pk_field = config.pk_field
    pk_type = config.pk_type

    # Pre-resolve filter paths for the list endpoint
    _resolved_filters: dict[str, tuple[str, str] | None] = {}
    for param_name, dot_path in config.filterable_fks.items():
        _resolved_filters[param_name] = _resolve_filter_path(Model, dot_path)

    # ------------------------------------------------------------------
    # LIST
    # ------------------------------------------------------------------

    @router.get("/", response_model=list[ReadSchema])
    async def list_items(
        request: Request,
        q: str | None = Query(None, description="Search substring"),
        db: AsyncSession = Depends(get_db),
    ):
        stmt = select(Model)

        # Eager-load children relationships
        for child_cfg in config.children:
            rel_name = child_cfg.name
            if _has_relationship(Model, rel_name):
                stmt = stmt.options(selectinload(_get_model_attr(Model, rel_name)))

        # Full-text search across searchable fields
        if q and config.searchable_fields:
            from sqlalchemy import or_

            conditions = [
                _get_model_attr(Model, f).icontains(q) for f in config.searchable_fields
            ]
            stmt = stmt.where(or_(*conditions))

        # Apply FK filters from query parameters
        for param_name, resolved in _resolved_filters.items():
            param_val = request.query_params.get(param_name)
            if param_val:
                if resolved is not None:
                    rel_name, col_name = resolved
                    child_cfg = next(
                        (c for c in config.children if c.name == rel_name),
                        None,
                    )
                    if child_cfg:
                        ChildModel = child_cfg.model
                        stmt = stmt.join(_get_model_attr(Model, rel_name)).where(
                            _get_model_attr(ChildModel, col_name) == param_val
                        )
                else:
                    stmt = stmt.where(_get_model_attr(Model, param_name) == param_val)

        if config.order_by:
            stmt = stmt.order_by(_get_model_attr(Model, config.order_by))

        result = await db.execute(stmt)
        return result.scalars().unique().all()

    # ------------------------------------------------------------------
    # GET by PK
    # ------------------------------------------------------------------

    async def _do_get(item_id: Any, db: AsyncSession):
        options = []
        for child_cfg in config.children:
            rel_name = child_cfg.name
            if _has_relationship(Model, rel_name):
                options.append(selectinload(_get_model_attr(Model, rel_name)))
        item = await db.get(Model, item_id, options=options or None)
        if not item:
            name = config.label_singular or config.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{name} not found")
        return item

    if pk_type is int:

        @router.get("/{item_id:int}", response_model=ReadSchema)
        async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
            return await _do_get(item_id, db)

    else:

        @router.get("/{item_id}", response_model=ReadSchema)
        async def get_item(item_id: str, db: AsyncSession = Depends(get_db)):
            return await _do_get(item_id, db)

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------

    create_item = _make_create_endpoint(config, Model, pk_field)
    router.add_api_route(
        "/",
        create_item,
        methods=["POST"],
        response_model=ReadSchema,
        status_code=201,
    )

    # ------------------------------------------------------------------
    # UPDATE (PATCH)
    # ------------------------------------------------------------------

    update_item = _make_update_endpoint(config, Model, pk_field, pk_type)
    update_path = "/{item_id:int}" if pk_type is int else "/{item_id}"
    router.add_api_route(
        update_path,
        update_item,
        methods=["PATCH"],
        response_model=ReadSchema,
    )

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------

    async def _do_delete(item_id: Any, db: AsyncSession):
        item = await db.get(Model, item_id)
        if not item:
            name = config.label_singular or config.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{name} not found")
        await db.delete(item)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if config.protect_on_delete:
                raise HTTPException(
                    409,
                    detail=f"{config.label_singular or config.name.rstrip('s').title()} "
                    f"'{item_id}' is still referenced by other records",
                ) from None
            raise

    if pk_type is int:

        @router.delete("/{item_id:int}", status_code=204)
        async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
            await _do_delete(item_id, db)

    else:

        @router.delete("/{item_id}", status_code=204)
        async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
            await _do_delete(item_id, db)

    return router
