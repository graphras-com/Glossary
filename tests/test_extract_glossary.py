"""Tests for the extract-glossary endpoint."""

import pytest
from httpx import AsyncClient

from app.services.openai_recommendation import RecommendationServiceError

# =========================================================================
# EXTRACT GLOSSARY
# =========================================================================


@pytest.mark.asyncio
async def test_extract_glossary_success(client: AsyncClient, monkeypatch):
    async def fake_extract(text: str):
        assert "LTE" in text
        return [
            {
                "term": "LTE",
                "en": "Long Term Evolution, a 4G standard.",
                "da": "Long Term Evolution, en 4G-standard.",
            },
            {
                "term": "RSSI",
                "en": "Received Signal Strength Indicator.",
                "da": "Modtaget signalstyrkeindikator.",
            },
        ]

    monkeypatch.setattr(
        "resources.routers.extract_glossary.extract_glossary", fake_extract
    )

    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "The LTE network uses RSSI for signal measurement."},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["terms"]) == 2
    assert body["terms"][0]["term"] == "LTE"
    assert body["terms"][0]["en"] == "Long Term Evolution, a 4G standard."
    assert body["terms"][0]["da"] == "Long Term Evolution, en 4G-standard."
    assert body["terms"][1]["term"] == "RSSI"
    assert "model" in body


@pytest.mark.asyncio
async def test_extract_glossary_empty_text_422(client: AsyncClient):
    r = await client.post("/terms/extract-glossary", json={"text": ""})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_extract_glossary_missing_text_422(client: AsyncClient):
    r = await client.post("/terms/extract-glossary", json={})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_extract_glossary_provider_error_503(client: AsyncClient, monkeypatch):
    async def fake_extract(text: str):
        raise RecommendationServiceError("AI provider returned an error")

    monkeypatch.setattr(
        "resources.routers.extract_glossary.extract_glossary", fake_extract
    )

    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "Some telecom text about 5G."},
    )
    assert r.status_code == 503
    assert r.json()["detail"] == "AI provider returned an error"


@pytest.mark.asyncio
async def test_extract_glossary_text_too_long_422(client: AsyncClient):
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "x" * 50001},
    )
    assert r.status_code == 422
