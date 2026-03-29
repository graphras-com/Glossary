"""Custom router: AI-powered definition recommendation.

This is an example of a domain-specific endpoint that goes beyond
generic CRUD.  In a new application, replace or remove this file.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_auth
from app.database import get_db
from app.services.openai_recommendation import (
    RecommendationServiceError,
    recommend_definition,
)
from resources.models import CategoryModel
from resources.schemas import DefinitionRecommendRequest, DefinitionRecommendResponse

router = APIRouter(
    prefix="/terms",
    tags=["terms"],
    dependencies=[Depends(require_auth)],
)


async def _category_breadcrumb(category: CategoryModel, db: AsyncSession) -> str:
    """Walk the category parent chain and return a breadcrumb string."""
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
