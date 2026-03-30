"""Custom router: AI-powered glossary extraction from free text.

Accepts a block of text and returns a list of telecom glossary terms
with definitions in English and Danish.
"""

import os

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_auth
from app.services.openai_glossary_extract import extract_glossary
from app.services.openai_recommendation import RecommendationServiceError
from resources.schemas import GlossaryExtractRequest, GlossaryExtractResponse

router = APIRouter(
    prefix="/terms",
    tags=["terms"],
    dependencies=[Depends(require_auth)],
)


@router.post("/extract-glossary", response_model=GlossaryExtractResponse)
async def extract_glossary_from_text(body: GlossaryExtractRequest):
    """Extract telecom glossary terms and definitions from free text."""
    model = os.environ.get("OPENAI_RECOMMENDATION_MODEL", "gpt-4.1-mini")

    try:
        terms = await extract_glossary(text=body.text)
    except RecommendationServiceError as exc:
        raise HTTPException(503, detail=str(exc)) from exc

    return GlossaryExtractResponse(terms=terms, model=model)
