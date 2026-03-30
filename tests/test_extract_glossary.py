"""Tests for the extract-glossary endpoint (DB-based text matching)."""

import pytest
from httpx import AsyncClient

# =========================================================================
# EXTRACT GLOSSARY
# =========================================================================


@pytest.mark.asyncio
async def test_extract_glossary_finds_matching_terms(
    client: AsyncClient,
    seed_term,
):
    """Terms present in the text should be returned with their definitions."""
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "The LTE network is widely deployed."},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["term"] == "LTE"
    assert len(body[0]["definitions"]) == 2


@pytest.mark.asyncio
async def test_extract_glossary_case_insensitive(
    client: AsyncClient,
    seed_term,
):
    """Matching should be case-insensitive."""
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "We measured lte coverage today."},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["term"] == "LTE"


@pytest.mark.asyncio
async def test_extract_glossary_no_matches(
    client: AsyncClient,
    seed_term,
):
    """When no terms match, an empty list is returned."""
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "This text has nothing relevant."},
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_extract_glossary_multiple_terms(
    client: AsyncClient,
    seed_categories,
):
    """Multiple matching terms are returned alphabetically."""
    await client.post(
        "/terms/",
        json={
            "term": "5G",
            "definitions": [{"en": "Fifth generation", "category_id": "network"}],
        },
    )
    await client.post(
        "/terms/",
        json={
            "term": "LTE",
            "definitions": [
                {"en": "Long Term Evolution", "category_id": "network.mobile"},
            ],
        },
    )
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "Both LTE and 5G are mobile standards."},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    terms = [t["term"] for t in body]
    assert terms == ["5G", "LTE"]  # alphabetical


@pytest.mark.asyncio
async def test_extract_glossary_empty_text_422(client: AsyncClient):
    r = await client.post("/terms/extract-glossary", json={"text": ""})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_extract_glossary_missing_text_422(client: AsyncClient):
    r = await client.post("/terms/extract-glossary", json={})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_extract_glossary_text_too_long_422(client: AsyncClient):
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "x" * 50001},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_extract_glossary_word_boundary(
    client: AsyncClient,
    seed_categories,
):
    """Terms should only match on word boundaries, not as substrings."""
    await client.post(
        "/terms/",
        json={
            "term": "SIM",
            "definitions": [
                {"en": "Subscriber Identity Module", "category_id": "network"},
            ],
        },
    )
    # "SIMPLE" contains "SIM" but should not match
    r = await client.post(
        "/terms/extract-glossary",
        json={"text": "This is a SIMPLE test without a SIM card."},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["term"] == "SIM"
