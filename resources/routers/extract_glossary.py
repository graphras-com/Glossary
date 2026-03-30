"""Custom router: extract matching glossary terms from free text.

Accepts a block of text and returns all database terms whose names
appear in the text (case-insensitive substring match).  No AI is
involved — this purely matches against the existing glossary.
"""

import re

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_auth
from app.database import get_db
from resources.models import TermModel
from resources.schemas import GlossaryExtractRequest, TermRead

router = APIRouter(
    prefix="/terms",
    tags=["terms"],
    dependencies=[Depends(require_auth)],
)


@router.post("/extract-glossary", response_model=list[TermRead])
async def extract_glossary_from_text(
    body: GlossaryExtractRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find all known glossary terms that appear in the submitted text."""
    text_lower = body.text.lower()

    result = await db.execute(select(TermModel).order_by(TermModel.term))
    all_terms = result.scalars().all()

    matched = []
    for term in all_terms:
        # Use word-boundary matching so "LTE" doesn't match inside "FILTER"
        pattern = re.escape(term.term)
        if re.search(rf"(?<!\w){pattern}(?!\w)", text_lower, re.IGNORECASE):
            matched.append(term)

    return matched
