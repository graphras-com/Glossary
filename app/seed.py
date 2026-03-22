import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CategoryModel, DefinitionModel, TermModel

BASE_DATA = Path(__file__).resolve().parent.parent / "base_data_import"
SEED_FILE = BASE_DATA / "glossary-seed.json"


async def seed(db: AsyncSession) -> None:
    """Seed the database from the backup-format glossary-seed.json if empty."""

    # Skip if data already exists
    result = await db.execute(select(CategoryModel).limit(1))
    if result.scalar_one_or_none() is not None:
        return

    payload = json.loads(SEED_FILE.read_text())

    # --- Categories (parents before children) ---
    inserted: set[str] = set()
    remaining = list(payload["categories"])
    max_rounds = len(remaining) + 1
    for _ in range(max_rounds):
        if not remaining:
            break
        still_remaining = []
        for cat in remaining:
            if cat["parent_id"] is None or cat["parent_id"] in inserted:
                db.add(
                    CategoryModel(
                        id=cat["id"],
                        parent_id=cat["parent_id"],
                        label=cat["label"],
                    )
                )
                inserted.add(cat["id"])
            else:
                still_remaining.append(cat)
        remaining = still_remaining
    await db.flush()

    # --- Terms + definitions ---
    for t in payload["terms"]:
        term = TermModel(term=t["term"])
        db.add(term)
        await db.flush()
        for d in t["definitions"]:
            db.add(
                DefinitionModel(
                    term_id=term.id,
                    en=d["en"],
                    da=d.get("da"),
                    category_id=d["category_id"],
                )
            )

    await db.commit()
