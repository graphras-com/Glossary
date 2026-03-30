"""Service: extract telecom glossary terms and definitions from free text.

Uses the same OpenAI configuration as the recommendation service but with
a prompt tailored for identifying and defining telecom terms found in a
given block of text.
"""

import json
import logging
import os

import httpx

from app.services.openai_recommendation import (
    RecommendationServiceError,
    _format_provider_error,
)

logger = logging.getLogger(__name__)


async def extract_glossary(text: str) -> list[dict]:
    """Send *text* to the AI provider and return a list of glossary entries.

    Each entry is a dict with keys ``term``, ``en``, and ``da``.

    Raises :class:`RecommendationServiceError` on configuration,
    network, or parsing errors.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RecommendationServiceError("AI recommendation is not configured")

    model = os.environ.get("OPENAI_RECOMMENDATION_MODEL", "gpt-4.1-mini")
    endpoint = os.environ.get(
        "OPENAI_API_URL", "https://api.openai.com/v1/chat/completions"
    )

    system_prompt = (
        "You are a telecom glossary expert. "
        "Given a block of text, identify all telecom-specific terms, "
        "abbreviations, and technical concepts. "
        "For each term, provide a concise definition in both English and Danish. "
        "Return strict JSON with a single key 'terms' whose value is an array "
        "of objects, each with keys: term, en, da. "
        "The 'term' value is the term name (use the common abbreviation if applicable). "
        "The 'en' value is a concise English definition (1-2 sentences). "
        "The 'da' value is a concise Danish definition (1-2 sentences). "
        "Sort terms alphabetically. "
        "Do not include markdown, lists, prefixes, or extra keys."
    )

    user_prompt = f"Extract telecom glossary terms from this text:\n\n{text}"

    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise RecommendationServiceError("Failed to reach AI provider") from exc

    if response.status_code >= 400:
        raise RecommendationServiceError(_format_provider_error(response))

    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RecommendationServiceError(
            "Invalid response format from AI provider"
        ) from exc

    terms = parsed.get("terms")
    if not isinstance(terms, list):
        raise RecommendationServiceError(
            "AI provider returned unexpected format (missing 'terms' array)"
        )

    # Validate and normalise each entry
    result = []
    for entry in terms:
        if not isinstance(entry, dict):
            continue
        term = str(entry.get("term", "")).strip()
        en = str(entry.get("en", "")).strip()
        da = str(entry.get("da", "")).strip()
        if term and en:
            result.append({"term": term, "en": en, "da": da})

    if not result:
        raise RecommendationServiceError(
            "AI provider could not identify any telecom terms in the text"
        )

    return result
