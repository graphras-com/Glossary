"""Generic backup and restore router.

Generates ``GET /backup`` and ``POST /backup/restore`` endpoints that
serialise / deserialise **all** registered resources.  The restore
endpoint requires a configurable admin role.

The backup format is::

    {
        "version": 1,
        "<resource_name>": [ ... ],
        ...
    }

Resources that declare :attr:`ResourceConfig.backup_children_field` will
embed their child rows inline (matching the current Glossary backup
format).  Resources with :attr:`ResourceConfig.self_referencing_fk` are
restored with topological insertion order.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_auth, require_role
from app.crud.registry import ResourceRegistry
from app.database import get_db


def create_backup_router(
    registry: ResourceRegistry,
    *,
    admin_role: str = "Admin",
    backup_version: int = 1,
) -> APIRouter:
    """Create an :class:`APIRouter` with backup/restore for *registry*."""

    router = APIRouter(
        prefix="/backup",
        tags=["backup"],
        dependencies=[Depends(require_auth)],
    )

    # ------------------------------------------------------------------
    # GET /backup
    # ------------------------------------------------------------------

    @router.get("/")
    async def backup(db: AsyncSession = Depends(get_db)):
        """Export all registered resources as a single JSON object."""
        result: dict[str, Any] = {"version": backup_version}

        for rc in registry.resources:
            rows = (await db.execute(select(rc.model))).scalars().all()

            if rc.backup_children_field and rc.children:
                # Embed children inline (e.g. terms with definitions)
                child_cfg = rc.children[0]  # primary child
                serialised = []
                for row in rows:
                    row_dict: dict[str, Any] = {}
                    for col in rc.model.__table__.columns:
                        col_name = col.key
                        if col_name == child_cfg.parent_fk:
                            continue
                        row_dict[col_name] = getattr(row, col_name)

                    # Remove auto-increment PK (not needed in backup)
                    if rc.pk_type is int:
                        row_dict.pop(rc.pk_field, None)

                    # Embed child rows
                    child_rows = getattr(row, rc.backup_children_field, [])
                    child_dicts = []
                    for child_row in child_rows:
                        child_dict: dict[str, Any] = {}
                        for col in child_cfg.model.__table__.columns:
                            col_name = col.key
                            if col_name in (
                                child_cfg.pk_field,
                                child_cfg.parent_fk,
                            ):
                                continue
                            child_dict[col_name] = getattr(child_row, col_name)
                        child_dicts.append(child_dict)
                    row_dict[rc.backup_children_field] = child_dicts
                    serialised.append(row_dict)
                result[rc.name] = serialised
            else:
                # Simple resource — serialise all columns
                serialised = []
                for row in rows:
                    row_dict = {}
                    for col in rc.model.__table__.columns:
                        row_dict[col.key] = getattr(row, col.key)
                    serialised.append(row_dict)
                result[rc.name] = serialised

        return result

    # ------------------------------------------------------------------
    # POST /backup/restore
    # ------------------------------------------------------------------

    @router.post(
        "/restore",
        status_code=200,
        dependencies=[Depends(require_role(admin_role))],
    )
    async def restore(payload: dict, db: AsyncSession = Depends(get_db)):
        """Replace all data with the contents of the uploaded backup."""

        # Delete in reverse registration order (children before parents)
        all_configs = list(registry.resources)
        for rc in reversed(all_configs):
            for child_cfg in rc.children:
                await db.execute(delete(child_cfg.model))
            await db.execute(delete(rc.model))
        await db.flush()

        stats: dict[str, int] = {}

        for rc in all_configs:
            items = payload.get(rc.name, [])

            if rc.self_referencing_fk:
                # Topological insert for self-referencing tables
                inserted: set[Any] = set()
                remaining = list(items)
                max_rounds = len(remaining) + 1
                for _ in range(max_rounds):
                    if not remaining:
                        break
                    still_remaining = []
                    for item_data in remaining:
                        ref_val = item_data.get(rc.self_referencing_fk)
                        if ref_val is None or ref_val in inserted:
                            obj = _build_model(rc.model, item_data)
                            db.add(obj)
                            pk_val = item_data.get(rc.pk_field)
                            if pk_val is not None:
                                inserted.add(pk_val)
                        else:
                            still_remaining.append(item_data)
                    remaining = still_remaining
                await db.flush()
            elif rc.backup_children_field and rc.children:
                child_cfg = rc.children[0]
                for item_data in items:
                    children_data = item_data.pop(rc.backup_children_field, [])
                    parent_cols = {col.key for col in rc.model.__table__.columns}
                    parent_kwargs = {
                        k: v for k, v in item_data.items() if k in parent_cols
                    }
                    parent_obj = rc.model(**parent_kwargs)
                    db.add(parent_obj)
                    await db.flush()

                    parent_pk = getattr(parent_obj, rc.pk_field)
                    for child_data in children_data:
                        child_data[child_cfg.parent_fk] = parent_pk
                        child_obj = child_cfg.model(**child_data)
                        db.add(child_obj)
            else:
                for item_data in items:
                    obj = _build_model(rc.model, item_data)
                    db.add(obj)
                await db.flush()

            stats[rc.name] = len(items)

        await db.commit()
        return {"status": "ok", **stats}

    return router


def _build_model(model_class: type, data: dict) -> Any:
    """Instantiate a model from a dict, filtering to valid column names."""
    valid_cols = {col.key for col in model_class.__table__.columns}
    kwargs = {k: v for k, v in data.items() if k in valid_cols}
    return model_class(**kwargs)
