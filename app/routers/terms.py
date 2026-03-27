from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import require_auth
from app.database import get_db
from app.models import CategoryModel, DefinitionModel, TermModel
from app.schemas import (
    DefinitionCreate,
    DefinitionRead,
    DefinitionRecommendRequest,
    DefinitionRecommendResponse,
    DefinitionUpdate,
    TermCreate,
    TermRead,
    TermUpdate,
)
from app.services.openai_recommendation import (
    RecommendationServiceError,
    recommend_definition,
)

router = APIRouter(
    prefix="/terms",
    tags=["terms"],
    dependencies=[Depends(require_auth)],
)


async def _category_breadcrumb(category: CategoryModel, db: AsyncSession) -> str:
    labels = [category.label]
    current = category
    while current.parent_id:
        parent = await db.get(CategoryModel, current.parent_id)
        if not parent:
            break
        labels.append(parent.label)
        current = parent
    labels.reverse()
    return " > ".join(labels)


# ---------------------------------------------------------------------------
# Terms
# ---------------------------------------------------------------------------


@router.post("/recommend-definition", response_model=DefinitionRecommendResponse)
async def recommend_term_definition(
    body: DefinitionRecommendRequest,
    db: AsyncSession = Depends(get_db),
):
    category_context = None
    if body.category_id:
        category = await db.get(CategoryModel, body.category_id)
        if not category:
            raise HTTPException(422, detail=f"Category '{body.category_id}' not found")
        category_context = await _category_breadcrumb(category, db)

    try:
        suggestion = await recommend_definition(
            term=body.term,
            category_context=category_context,
        )
    except RecommendationServiceError as exc:
        raise HTTPException(503, detail=str(exc)) from exc

    return DefinitionRecommendResponse(**suggestion)


@router.get("/", response_model=list[TermRead])
async def list_terms(
    q: str | None = Query(None, description="Filter terms containing this substring"),
    category: str | None = Query(None, description="Filter by category id"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TermModel).options(selectinload(TermModel.definitions))
    if q:
        stmt = stmt.where(TermModel.term.icontains(q))
    if category:
        stmt = stmt.join(TermModel.definitions).where(
            DefinitionModel.category_id == category
        )
    stmt = stmt.order_by(TermModel.term)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/{term_id}", response_model=TermRead)
async def get_term(term_id: int, db: AsyncSession = Depends(get_db)):
    term = await db.get(
        TermModel, term_id, options=[selectinload(TermModel.definitions)]
    )
    if not term:
        raise HTTPException(404, detail="Term not found")
    return term


@router.post("/", response_model=TermRead, status_code=201)
async def create_term(body: TermCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate term name
    existing = await db.execute(select(TermModel).where(TermModel.term == body.term))
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail=f"Term '{body.term}' already exists")

    # Validate all referenced categories exist
    for defn in body.definitions:
        cat = await db.get(CategoryModel, defn.category_id)
        if not cat:
            raise HTTPException(422, detail=f"Category '{defn.category_id}' not found")

    term = TermModel(
        term=body.term,
        definitions=[
            DefinitionModel(en=d.en, da=d.da, category_id=d.category_id)
            for d in body.definitions
        ],
    )
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return term


@router.patch("/{term_id}", response_model=TermRead)
async def update_term(
    term_id: int, body: TermUpdate, db: AsyncSession = Depends(get_db)
):
    term = await db.get(
        TermModel, term_id, options=[selectinload(TermModel.definitions)]
    )
    if not term:
        raise HTTPException(404, detail="Term not found")
    updates = body.model_dump(exclude_unset=True)
    if "term" in updates:
        dup = await db.execute(
            select(TermModel).where(
                TermModel.term == updates["term"], TermModel.id != term_id
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(409, detail=f"Term '{updates['term']}' already exists")
    for key, value in updates.items():
        setattr(term, key, value)
    await db.commit()
    await db.refresh(term)
    return term


@router.delete("/{term_id}", status_code=204)
async def delete_term(term_id: int, db: AsyncSession = Depends(get_db)):
    term = await db.get(TermModel, term_id)
    if not term:
        raise HTTPException(404, detail="Term not found")
    await db.delete(term)
    await db.commit()


# ---------------------------------------------------------------------------
# Definitions (nested under a term)
# ---------------------------------------------------------------------------


@router.post("/{term_id}/definitions", response_model=DefinitionRead, status_code=201)
async def add_definition(
    term_id: int, body: DefinitionCreate, db: AsyncSession = Depends(get_db)
):
    term = await db.get(TermModel, term_id)
    if not term:
        raise HTTPException(404, detail="Term not found")
    cat = await db.get(CategoryModel, body.category_id)
    if not cat:
        raise HTTPException(422, detail=f"Category '{body.category_id}' not found")
    defn = DefinitionModel(
        term_id=term_id, en=body.en, da=body.da, category_id=body.category_id
    )
    db.add(defn)
    await db.commit()
    await db.refresh(defn)
    return defn


@router.patch("/{term_id}/definitions/{definition_id}", response_model=DefinitionRead)
async def update_definition(
    term_id: int,
    definition_id: int,
    body: DefinitionUpdate,
    db: AsyncSession = Depends(get_db),
):
    defn = await db.get(DefinitionModel, definition_id)
    if not defn or defn.term_id != term_id:
        raise HTTPException(404, detail="Definition not found")
    updates = body.model_dump(exclude_unset=True)
    if "category_id" in updates:
        cat = await db.get(CategoryModel, updates["category_id"])
        if not cat:
            raise HTTPException(
                422, detail=f"Category '{updates['category_id']}' not found"
            )
    for key, value in updates.items():
        setattr(defn, key, value)
    await db.commit()
    await db.refresh(defn)
    return defn


@router.delete("/{term_id}/definitions/{definition_id}", status_code=204)
async def delete_definition(
    term_id: int, definition_id: int, db: AsyncSession = Depends(get_db)
):
    defn = await db.get(DefinitionModel, definition_id)
    if not defn or defn.term_id != term_id:
        raise HTTPException(404, detail="Definition not found")
    await db.delete(defn)
    await db.commit()
