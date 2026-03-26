import httpx

from app.services.openai_recommendation import _format_provider_error


def test_format_provider_error_uses_openai_error_message():
    response = httpx.Response(
        429,
        json={
            "error": {
                "message": "Rate limit exceeded for gpt-4.1-mini.",
                "type": "rate_limit_error",
                "code": "rate_limit_exceeded",
            }
        },
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )

    detail = _format_provider_error(response)

    assert detail == (
        "AI provider returned 429: Rate limit exceeded for gpt-4.1-mini. "
        "(rate_limit_error, rate_limit_exceeded)"
    )


def test_format_provider_error_falls_back_to_detail():
    response = httpx.Response(
        401,
        json={"detail": "Invalid API key"},
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )

    detail = _format_provider_error(response)

    assert detail == "AI provider returned 401: Invalid API key"


def test_format_provider_error_falls_back_to_text():
    response = httpx.Response(
        500,
        text="upstream timeout",
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )

    detail = _format_provider_error(response)

    assert detail == "AI provider returned 500: upstream timeout"
