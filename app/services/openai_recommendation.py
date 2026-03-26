import json
import os

import httpx


class RecommendationServiceError(Exception):
    pass


async def recommend_definition(term: str, category_context: str | None = None) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RecommendationServiceError("AI recommendation is not configured")

    model = os.environ.get("OPENAI_RECOMMENDATION_MODEL", "gpt-4.1-mini")
    endpoint = os.environ.get(
        "OPENAI_API_URL", "https://api.openai.com/v1/chat/completions"
    )

    system_prompt = (
        "You generate glossary definitions for telecom terms. "
        "Return strict JSON with keys en and da. "
        "Both values must be concise plain-text definitions, 1-2 sentences each. "
        "Do not include markdown, lists, prefixes, or extra keys."
    )

    system_prompt_alt = (
        "You are a glossary writer for a telecom company. "
        "Your job is to define one telecom-related term in two languages: "
        "- English (`en`) "
        "- Danish (`da`) "

        "Instructions: "
        "1. Read the input term. "
        "2. Interpret it in a telecommunications context. "
        "3. Write one short, clear definition in English. "
        "4. Write one short, clear definition in Danish. "
        "5. Make both definitions easy for non-experts to understand. "
        "6. Keep each definition to one sentence. "
        "7. Avoid jargon unless necessary. "
        "8. Do not add notes, explanations, confidence statements, or alternative meanings. "
        "9. Return YAML only. "

        "Required YAML schema: "
        "en: \"<definition in English>\" "
        "da: \"<definition in Danish>\" "
    )


    user_prompt = f"Term: {term}"
    if category_context:
        user_prompt += f"\nCategory context: {category_context}"

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
        async with httpx.AsyncClient(timeout=20.0) as client:
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
        raise RecommendationServiceError("AI provider returned an error")

    data = response.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RecommendationServiceError(
            "Invalid response format from AI provider"
        ) from exc

    en = str(parsed.get("en", "")).strip()
    da = str(parsed.get("da", "")).strip()
    if not en or not da:
        raise RecommendationServiceError("AI provider returned incomplete definition")

    return {"en": en, "da": da, "model": model}
