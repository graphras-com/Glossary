import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CategoryModel, DefinitionModel, TermModel
from app.seed import SEED_FILE, seed


def _load_seed():
    return json.loads(SEED_FILE.read_text())


@pytest.mark.asyncio
async def test_seed_loads_all_categories(db_session: AsyncSession):
    await seed(db_session)

    payload = _load_seed()
    result = await db_session.execute(select(func.count(CategoryModel.id)))
    assert result.scalar() == len(payload["categories"])


@pytest.mark.asyncio
async def test_seed_loads_all_terms(db_session: AsyncSession):
    await seed(db_session)

    payload = _load_seed()
    result = await db_session.execute(select(func.count(TermModel.id)))
    assert result.scalar() == len(payload["terms"])


@pytest.mark.asyncio
async def test_seed_loads_all_definitions(db_session: AsyncSession):
    await seed(db_session)

    payload = _load_seed()
    total_defs = sum(len(t["definitions"]) for t in payload["terms"])

    result = await db_session.execute(select(func.count(DefinitionModel.id)))
    assert result.scalar() == total_defs


@pytest.mark.asyncio
async def test_seed_is_idempotent(db_session: AsyncSession):
    """Calling seed twice should not insert duplicate data."""
    await seed(db_session)

    result1 = await db_session.execute(select(func.count(CategoryModel.id)))
    cat_count = result1.scalar()
    result2 = await db_session.execute(select(func.count(TermModel.id)))
    term_count = result2.scalar()

    # Seed again
    await seed(db_session)

    result3 = await db_session.execute(select(func.count(CategoryModel.id)))
    assert result3.scalar() == cat_count
    result4 = await db_session.execute(select(func.count(TermModel.id)))
    assert result4.scalar() == term_count


@pytest.mark.asyncio
async def test_seed_category_parent_references_valid(db_session: AsyncSession):
    """Every category with a parent_id should reference an existing category."""
    await seed(db_session)

    result = await db_session.execute(
        select(CategoryModel).where(CategoryModel.parent_id.isnot(None))
    )
    children = result.scalars().all()
    assert len(children) > 0

    for child in children:
        parent = await db_session.get(CategoryModel, child.parent_id)
        assert parent is not None, (
            f"Category '{child.id}' references missing parent '{child.parent_id}'"
        )


@pytest.mark.asyncio
async def test_seed_definition_category_references_valid(db_session: AsyncSession):
    """Every definition's category_id should reference an existing category."""
    await seed(db_session)

    result = await db_session.execute(select(DefinitionModel))
    definitions = result.scalars().all()
    assert len(definitions) > 0

    cat_ids_result = await db_session.execute(select(CategoryModel.id))
    valid_ids = {row[0] for row in cat_ids_result.all()}

    for defn in definitions:
        assert defn.category_id in valid_ids, (
            f"Definition {defn.id} references unknown category '{defn.category_id}'"
        )


@pytest.mark.asyncio
async def test_seed_file_matches_backup_schema(db_session: AsyncSession):
    """The seed file should have the expected backup payload structure."""
    payload = _load_seed()

    assert "version" in payload
    assert "categories" in payload
    assert "terms" in payload
    assert payload["version"] == 1

    for cat in payload["categories"]:
        assert "id" in cat
        assert "label" in cat
        assert "parent_id" in cat

    for term in payload["terms"]:
        assert "term" in term
        assert "definitions" in term
        for d in term["definitions"]:
            assert "en" in d
            assert "category_id" in d
