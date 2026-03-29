"""Generic seed module that loads initial data from a JSON file.

The seed file format matches the backup format::

    {
        "categories": [...],
        "terms": [...]
    }

Seeding is **idempotent**: it only runs if the first registered resource
table is empty.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.registry import ResourceRegistry

logger = logging.getLogger(__name__)


async def seed_from_file(
    db: AsyncSession,
    registry: ResourceRegistry,
    seed_file: Path,
) -> None:
    """Seed the database from *seed_file* if the first resource table is empty.

    The JSON structure must have top-level keys matching resource names.
    """
    if not seed_file.exists():
        logger.info("Seed file %s not found, skipping.", seed_file)
        return

    resources = registry.resources
    if not resources:
        return

    # Check if the first resource table already has data
    first_rc = resources[0]
    result = await db.execute(select(first_rc.model).limit(1))
    if result.scalar_one_or_none() is not None:
        logger.info("Database already seeded, skipping.")
        return

    payload = json.loads(seed_file.read_text())

    for rc in resources:
        items = payload.get(rc.name, [])
        if not items:
            continue

        if rc.self_referencing_fk:
            # Topological insert
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
                        obj = rc.model(
                            **{
                                k: v
                                for k, v in item_data.items()
                                if k in {col.key for col in rc.model.__table__.columns}
                            }
                        )
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
                children_data = item_data.get(rc.backup_children_field, [])
                parent_cols = {col.key for col in rc.model.__table__.columns}
                parent_kwargs = {k: v for k, v in item_data.items() if k in parent_cols}
                parent_obj = rc.model(**parent_kwargs)
                db.add(parent_obj)
                await db.flush()

                parent_pk = getattr(parent_obj, rc.pk_field)
                for child_data in children_data:
                    child_data_copy = dict(child_data)
                    child_data_copy[child_cfg.parent_fk] = parent_pk
                    child_cols = {col.key for col in child_cfg.model.__table__.columns}
                    child_kwargs = {
                        k: v for k, v in child_data_copy.items() if k in child_cols
                    }
                    child_obj = child_cfg.model(**child_kwargs)
                    db.add(child_obj)
        else:
            for item_data in items:
                valid_cols = {col.key for col in rc.model.__table__.columns}
                kwargs = {k: v for k, v in item_data.items() if k in valid_cols}
                obj = rc.model(**kwargs)
                db.add(obj)
            await db.flush()

    await db.commit()
    logger.info("Database seeded from %s.", seed_file)
