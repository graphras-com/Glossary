import json
import os

import httpx


class RecommendationServiceError(Exception):
    pass


def _format_provider_error(response: httpx.Response) -> str:
    status = response.status_code
    message = ""

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message") or "").strip()
            error_type = str(error.get("type") or "").strip()
            error_code = str(error.get("code") or "").strip()
            extras = [value for value in [error_type, error_code] if value]
            if extras:
                suffix = ", ".join(extras)
                message = f"{message} ({suffix})" if message else suffix
        if not message:
            message = str(payload.get("detail") or "").strip()

    if not message:
        message = response.text.strip()

    if not message:
        message = "Unknown provider error"

    return f"AI provider returned {status}: {message}"


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
        raise RecommendationServiceError(_format_provider_error(response))

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
