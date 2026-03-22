from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CategoryModel, DefinitionModel, TermModel
from app.schemas import (
    BackupCategory,
    BackupDefinition,
    BackupPayload,
    BackupTerm,
)

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/", response_model=BackupPayload)
async def backup(db: AsyncSession = Depends(get_db)):
    """Export every category, term, and definition as a single JSON object."""
    # Categories
    cats = (await db.execute(select(CategoryModel))).scalars().all()
    backup_categories = [
        BackupCategory(id=c.id, parent_id=c.parent_id, label=c.label) for c in cats
    ]

    # Terms + definitions
    terms = (await db.execute(select(TermModel))).scalars().all()
    backup_terms = [
        BackupTerm(
            term=t.term,
            definitions=[
                BackupDefinition(en=d.en, da=d.da, category_id=d.category_id)
                for d in t.definitions
            ],
        )
        for t in terms
    ]

    return BackupPayload(version=1, categories=backup_categories, terms=backup_terms)


@router.post("/restore", status_code=200)
async def restore(payload: BackupPayload, db: AsyncSession = Depends(get_db)):
    """Replace all data with the contents of the uploaded backup JSON.

    Order of operations:
      1. Delete all definitions (FK to terms and categories)
      2. Delete all terms
      3. Delete all categories
      4. Insert categories (parents before children)
      5. Insert terms + definitions
    """
    await db.execute(delete(DefinitionModel))
    await db.execute(delete(TermModel))
    await db.execute(delete(CategoryModel))
    await db.flush()

    # --- categories (parents first) ---
    inserted: set[str] = set()
    remaining = list(payload.categories)
    # Simple topological insert: keep looping until all inserted
    max_rounds = len(remaining) + 1
    for _ in range(max_rounds):
        if not remaining:
            break
        still_remaining = []
        for cat in remaining:
            if cat.parent_id is None or cat.parent_id in inserted:
                db.add(
                    CategoryModel(id=cat.id, parent_id=cat.parent_id, label=cat.label)
                )
                inserted.add(cat.id)
            else:
                still_remaining.append(cat)
        remaining = still_remaining
    await db.flush()

    # --- terms + definitions ---
    for t in payload.terms:
        term = TermModel(term=t.term)
        db.add(term)
        await db.flush()  # obtain term.id
        for d in t.definitions:
            db.add(
                DefinitionModel(
                    term_id=term.id, en=d.en, da=d.da, category_id=d.category_id
                )
            )
    await db.commit()

    return {
        "status": "ok",
        "categories": len(payload.categories),
        "terms": len(payload.terms),
    }
