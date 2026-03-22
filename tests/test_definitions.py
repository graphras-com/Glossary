import pytest
from httpx import AsyncClient

# =========================================================================
# ADD DEFINITION
# =========================================================================


@pytest.mark.asyncio
async def test_add_definition(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={
            "en": "Third definition",
            "da": "Tredje definition",
            "category_id": "network.access",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["en"] == "Third definition"
    assert body["da"] == "Tredje definition"
    assert body["category_id"] == "network.access"
    assert body["id"] is not None

    # Verify it appears on the term
    r = await client.get(f"/terms/{term_id}")
    assert len(r.json()["definitions"]) == 3


@pytest.mark.asyncio
async def test_add_definition_without_da(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={"en": "English only", "category_id": "network"},
    )
    assert r.status_code == 201
    assert r.json()["da"] is None


@pytest.mark.asyncio
async def test_add_definition_term_not_found(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/99999/definitions",
        json={"en": "Orphan", "category_id": "network"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_add_definition_invalid_category_422(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={"en": "Bad ref", "category_id": "ghost"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_add_definition_empty_en_422(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={"en": "", "category_id": "network"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_add_definition_missing_fields_422(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.post(f"/terms/{term_id}/definitions", json={"en": "No cat"})
    assert r.status_code == 422


# =========================================================================
# PATCH DEFINITION
# =========================================================================


@pytest.mark.asyncio
async def test_update_definition_en(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/{def_id}",
        json={"en": "Updated English text"},
    )
    assert r.status_code == 200
    assert r.json()["en"] == "Updated English text"


@pytest.mark.asyncio
async def test_update_definition_da(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/{def_id}",
        json={"da": "Opdateret dansk tekst"},
    )
    assert r.status_code == 200
    assert r.json()["da"] == "Opdateret dansk tekst"


@pytest.mark.asyncio
async def test_update_definition_clear_da(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    # First definition has da set
    def_id = seed_term["definitions"][0]["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/{def_id}",
        json={"da": None},
    )
    assert r.status_code == 200
    assert r.json()["da"] is None


@pytest.mark.asyncio
async def test_update_definition_category(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/{def_id}",
        json={"category_id": "commercial"},
    )
    assert r.status_code == 200
    assert r.json()["category_id"] == "commercial"


@pytest.mark.asyncio
async def test_update_definition_invalid_category_422(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/{def_id}",
        json={"category_id": "nonexistent"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_definition_not_found(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.patch(
        f"/terms/{term_id}/definitions/99999",
        json={"en": "X"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_definition_wrong_term_404(client: AsyncClient, seed_categories):
    """Definition exists but belongs to a different term."""
    r1 = await client.post(
        "/terms/",
        json={"term": "TermA", "definitions": [{"en": "A", "category_id": "network"}]},
    )
    r2 = await client.post(
        "/terms/",
        json={"term": "TermB", "definitions": [{"en": "B", "category_id": "network"}]},
    )
    def_id_a = r1.json()["definitions"][0]["id"]
    term_b_id = r2.json()["id"]

    # Try to patch definition from TermA using TermB's path
    r = await client.patch(
        f"/terms/{term_b_id}/definitions/{def_id_a}",
        json={"en": "Hijack attempt"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_definition_noop(client: AsyncClient, seed_term):
    """PATCH with empty body should succeed and return unchanged data."""
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    original_en = seed_term["definitions"][0]["en"]
    r = await client.patch(f"/terms/{term_id}/definitions/{def_id}", json={})
    assert r.status_code == 200
    assert r.json()["en"] == original_en


# =========================================================================
# DELETE DEFINITION
# =========================================================================


@pytest.mark.asyncio
async def test_delete_definition(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    def_id = seed_term["definitions"][0]["id"]
    r = await client.delete(f"/terms/{term_id}/definitions/{def_id}")
    assert r.status_code == 204

    # Verify the term still exists but has one fewer definition
    r = await client.get(f"/terms/{term_id}")
    assert r.status_code == 200
    assert len(r.json()["definitions"]) == 1


@pytest.mark.asyncio
async def test_delete_definition_not_found(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.delete(f"/terms/{term_id}/definitions/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_definition_wrong_term_404(client: AsyncClient, seed_categories):
    """Definition exists but belongs to a different term."""
    r1 = await client.post(
        "/terms/",
        json={"term": "TermX", "definitions": [{"en": "X", "category_id": "network"}]},
    )
    r2 = await client.post(
        "/terms/",
        json={"term": "TermY", "definitions": [{"en": "Y", "category_id": "network"}]},
    )
    def_id_x = r1.json()["definitions"][0]["id"]
    term_y_id = r2.json()["id"]

    r = await client.delete(f"/terms/{term_y_id}/definitions/{def_id_x}")
    assert r.status_code == 404
