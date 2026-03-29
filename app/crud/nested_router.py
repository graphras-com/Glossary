"""Auto-generate nested CRUD endpoints for child resources.

Given a parent :class:`ResourceConfig` and a :class:`ChildResourceConfig`,
generates:

- ``POST   /{parent}/{parent_pk}/{child}``         — create child
- ``PATCH  /{parent}/{parent_pk}/{child}/{child_pk}`` — update child
- ``DELETE /{parent}/{parent_pk}/{child}/{child_pk}`` — delete child

The list and get-by-PK for child resources are typically embedded in the
parent's read schema (eager-loaded), so separate list/get endpoints are
not generated.
"""

from __future__ import annotations

import inspect
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_auth
from app.crud.registry import ChildResourceConfig, ResourceConfig
from app.database import get_db


def create_nested_crud_router(
    parent: ResourceConfig, child: ChildResourceConfig
) -> APIRouter:
    """Build an :class:`APIRouter` with nested child CRUD under the parent."""

    router = APIRouter(
        prefix=f"/{parent.name}",
        tags=[parent.name],
        dependencies=[Depends(require_auth)],
    )

    ParentModel = parent.model
    ChildModel = child.model
    ReadSchema = child.read_schema
    parent_fk = child.parent_fk

    # ------------------------------------------------------------------
    # Shared logic
    # ------------------------------------------------------------------

    async def _do_create(parent_id: Any, body: Any, db: AsyncSession):
        parent_obj = await db.get(ParentModel, parent_id)
        if not parent_obj:
            name = parent.label_singular or parent.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{name} not found")

        data = body.model_dump()

        # Validate FK references on the child
        for fk_field, fk_model in child.fk_validations.items():
            val = data.get(fk_field)
            if val is not None:
                ref = await db.get(fk_model, val)
                if not ref:
                    raise HTTPException(
                        422,
                        detail=f"Referenced {fk_field} '{val}' not found",
                    )

        data[parent_fk] = parent_id

        child_obj = ChildModel(**data)
        db.add(child_obj)
        await db.commit()
        await db.refresh(child_obj)
        return child_obj

    async def _do_update(parent_id: Any, child_id: Any, body: Any, db: AsyncSession):
        child_obj = await db.get(ChildModel, child_id)
        if not child_obj or getattr(child_obj, parent_fk) != parent_id:
            child_name = child.label_singular or child.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{child_name} not found")

        updates = body.model_dump(exclude_unset=True)

        for fk_field, fk_model in child.fk_validations.items():
            if fk_field in updates:
                val = updates[fk_field]
                if val is not None:
                    ref = await db.get(fk_model, val)
                    if not ref:
                        raise HTTPException(
                            422,
                            detail=f"Referenced {fk_field} '{val}' not found",
                        )

        for key, value in updates.items():
            setattr(child_obj, key, value)

        await db.commit()
        await db.refresh(child_obj)
        return child_obj

    async def _do_delete(parent_id: Any, child_id: Any, db: AsyncSession):
        child_obj = await db.get(ChildModel, child_id)
        if not child_obj or getattr(child_obj, parent_fk) != parent_id:
            child_name = child.label_singular or child.name.rstrip("s").title()
            raise HTTPException(404, detail=f"{child_name} not found")
        await db.delete(child_obj)
        await db.commit()

    # ------------------------------------------------------------------
    # CREATE child — build endpoint with proper signature
    # ------------------------------------------------------------------

    CreateSchema = child.create_schema

    if parent.pk_type is int:

        async def create_child(
            parent_id: int,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_create(parent_id, body, db)

    else:

        async def create_child(
            parent_id: str,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_create(parent_id, body, db)

    # Patch the signature so FastAPI sees the correct Pydantic type
    sig = inspect.signature(create_child)
    params = list(sig.parameters.values())
    new_params = []
    for p in params:
        if p.name == "body":
            new_params.append(
                p.replace(annotation=CreateSchema, default=inspect.Parameter.empty)
            )
        else:
            new_params.append(p)
    create_child.__signature__ = sig.replace(parameters=new_params)

    router.add_api_route(
        f"/{{parent_id}}/{child.name}"
        if parent.pk_type is not int
        else f"/{{parent_id:int}}/{child.name}",
        create_child,
        methods=["POST"],
        response_model=ReadSchema,
        status_code=201,
    )

    # ------------------------------------------------------------------
    # UPDATE child — build endpoint with proper signature
    # ------------------------------------------------------------------

    UpdateSchema = child.update_schema

    if parent.pk_type is int:

        async def update_child(
            parent_id: int,
            child_id: int,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_update(parent_id, child_id, body, db)

    else:

        async def update_child(
            parent_id: str,
            child_id: int,
            body: Any = Body(...),
            db: AsyncSession = Depends(get_db),
        ):
            return await _do_update(parent_id, child_id, body, db)

    sig = inspect.signature(update_child)
    params = list(sig.parameters.values())
    new_params = []
    for p in params:
        if p.name == "body":
            new_params.append(
                p.replace(annotation=UpdateSchema, default=inspect.Parameter.empty)
            )
        else:
            new_params.append(p)
    update_child.__signature__ = sig.replace(parameters=new_params)

    router.add_api_route(
        f"/{{parent_id:int}}/{child.name}/{{child_id:int}}"
        if parent.pk_type is int
        else f"/{{parent_id}}/{child.name}/{{child_id:int}}",
        update_child,
        methods=["PATCH"],
        response_model=ReadSchema,
    )

    # ------------------------------------------------------------------
    # DELETE child
    # ------------------------------------------------------------------

    if parent.pk_type is int:

        @router.delete(
            f"/{{parent_id:int}}/{child.name}/{{child_id:int}}",
            status_code=204,
        )
        async def delete_child(
            parent_id: int,
            child_id: int,
            db: AsyncSession = Depends(get_db),
        ):
            await _do_delete(parent_id, child_id, db)

    else:

        @router.delete(
            f"/{{parent_id}}/{child.name}/{{child_id:int}}",
            status_code=204,
        )
        async def delete_child(
            parent_id: str,
            child_id: int,
            db: AsyncSession = Depends(get_db),
        ):
            await _do_delete(parent_id, child_id, db)

    return router
