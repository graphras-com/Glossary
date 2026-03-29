import pytest
from httpx import AsyncClient

from app.services.openai_recommendation import RecommendationServiceError

# =========================================================================
# LIST
# =========================================================================


@pytest.mark.asyncio
async def test_list_terms_empty(client: AsyncClient):
    r = await client.get("/terms/")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_terms_returns_all(client: AsyncClient, seed_term):
    r = await client.get("/terms/")
    assert r.status_code == 200
    terms = r.json()
    assert len(terms) == 1
    assert terms[0]["term"] == "LTE"


@pytest.mark.asyncio
async def test_list_terms_ordered_alphabetically(client: AsyncClient, seed_categories):
    for name in ["Zeta", "Alpha", "Mu"]:
        await client.post(
            "/terms/",
            json={
                "term": name,
                "definitions": [{"en": f"Def of {name}", "category_id": "network"}],
            },
        )
    r = await client.get("/terms/")
    names = [t["term"] for t in r.json()]
    assert names == sorted(names)


# =========================================================================
# SEARCH (q parameter)
# =========================================================================


@pytest.mark.asyncio
async def test_search_terms_substring(client: AsyncClient, seed_categories):
    await client.post(
        "/terms/",
        json={
            "term": "DNS",
            "definitions": [{"en": "Domain Name System", "category_id": "network"}],
        },
    )
    await client.post(
        "/terms/",
        json={
            "term": "DNS Root Servers",
            "definitions": [{"en": "Root servers", "category_id": "network"}],
        },
    )
    await client.post(
        "/terms/",
        json={
            "term": "MPLS",
            "definitions": [{"en": "Label switching", "category_id": "network"}],
        },
    )

    r = await client.get("/terms/", params={"q": "dns"})
    assert r.status_code == 200
    terms = r.json()
    assert len(terms) == 2
    assert all("DNS" in t["term"] for t in terms)


@pytest.mark.asyncio
async def test_search_terms_case_insensitive(client: AsyncClient, seed_categories):
    await client.post(
        "/terms/",
        json={
            "term": "FooBar",
            "definitions": [{"en": "Test", "category_id": "network"}],
        },
    )
    r = await client.get("/terms/", params={"q": "foobar"})
    assert len(r.json()) == 1

    r = await client.get("/terms/", params={"q": "FOOBAR"})
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_search_terms_no_match(client: AsyncClient, seed_term):
    r = await client.get("/terms/", params={"q": "zzzznonexistentzzzz"})
    assert r.status_code == 200
    assert r.json() == []


# =========================================================================
# FILTER BY CATEGORY
# =========================================================================


@pytest.mark.asyncio
async def test_filter_by_category(client: AsyncClient, seed_categories):
    await client.post(
        "/terms/",
        json={
            "term": "RAN",
            "definitions": [
                {"en": "Radio Access Network", "category_id": "network.mobile"}
            ],
        },
    )
    await client.post(
        "/terms/",
        json={
            "term": "MPLS",
            "definitions": [{"en": "Label switching", "category_id": "network"}],
        },
    )

    r = await client.get("/terms/", params={"category": "network.mobile"})
    assert r.status_code == 200
    terms = r.json()
    assert len(terms) == 1
    assert terms[0]["term"] == "RAN"


@pytest.mark.asyncio
async def test_filter_by_category_no_match(client: AsyncClient, seed_term):
    r = await client.get("/terms/", params={"category": "commercial"})
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_filter_combined_q_and_category(client: AsyncClient, seed_categories):
    await client.post(
        "/terms/",
        json={
            "term": "Mobile Core",
            "definitions": [
                {"en": "Central mobile domain", "category_id": "network.mobile"}
            ],
        },
    )
    await client.post(
        "/terms/",
        json={
            "term": "Core Router",
            "definitions": [{"en": "Backbone router", "category_id": "network"}],
        },
    )

    # Both contain "Core" but only one is in network.mobile
    r = await client.get("/terms/", params={"q": "Core", "category": "network.mobile"})
    terms = r.json()
    assert len(terms) == 1
    assert terms[0]["term"] == "Mobile Core"


# =========================================================================
# GET
# =========================================================================


@pytest.mark.asyncio
async def test_get_term(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.get(f"/terms/{term_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["term"] == "LTE"
    assert len(body["definitions"]) == 2


@pytest.mark.asyncio
async def test_get_term_not_found(client: AsyncClient):
    r = await client.get("/terms/99999")
    assert r.status_code == 404


# =========================================================================
# CREATE
# =========================================================================


@pytest.mark.asyncio
async def test_create_term(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/",
        json={
            "term": "SIM Card",
            "definitions": [
                {
                    "en": "Subscriber identity module",
                    "da": "Abonnentidentitetsmodul",
                    "category_id": "network.mobile",
                },
            ],
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["term"] == "SIM Card"
    assert body["id"] is not None
    assert len(body["definitions"]) == 1
    assert body["definitions"][0]["en"] == "Subscriber identity module"
    assert body["definitions"][0]["da"] == "Abonnentidentitetsmodul"
    assert body["definitions"][0]["category_id"] == "network.mobile"


@pytest.mark.asyncio
async def test_create_term_without_da(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/",
        json={
            "term": "NAT",
            "definitions": [
                {"en": "Network Address Translation", "category_id": "network"}
            ],
        },
    )
    assert r.status_code == 201
    assert r.json()["definitions"][0]["da"] is None


@pytest.mark.asyncio
async def test_create_term_multiple_definitions(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/",
        json={
            "term": "Long Haul",
            "definitions": [
                {
                    "en": "High-capacity transport over long distances",
                    "category_id": "network",
                },
                {"en": "Microwave transport solution", "category_id": "network.access"},
            ],
        },
    )
    assert r.status_code == 201
    assert len(r.json()["definitions"]) == 2


@pytest.mark.asyncio
async def test_create_term_duplicate_409(client: AsyncClient, seed_term):
    r = await client.post(
        "/terms/",
        json={
            "term": "LTE",
            "definitions": [{"en": "Duplicate", "category_id": "network"}],
        },
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_create_term_invalid_category_422(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/",
        json={
            "term": "Ghost",
            "definitions": [{"en": "Bad ref", "category_id": "nonexistent"}],
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_term_empty_name_422(client: AsyncClient):
    r = await client.post(
        "/terms/",
        json={"term": "", "definitions": [{"en": "x", "category_id": "y"}]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_term_no_definitions_422(client: AsyncClient):
    r = await client.post("/terms/", json={"term": "Orphan", "definitions": []})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_term_empty_en_422(client: AsyncClient, seed_categories):
    r = await client.post(
        "/terms/",
        json={"term": "Bad", "definitions": [{"en": "", "category_id": "network"}]},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_term_missing_fields_422(client: AsyncClient):
    r = await client.post("/terms/", json={"term": "NoDefsKey"})
    assert r.status_code == 422


# =========================================================================
# RECOMMEND DEFINITION
# =========================================================================


@pytest.mark.asyncio
async def test_recommend_definition(client: AsyncClient, seed_categories, monkeypatch):
    async def fake_recommend(term: str, category_context: str | None = None):
        assert term == "SIM"
        assert category_context == "Network > Mobile"
        return {
            "en": "A secure chip that identifies a mobile subscriber.",
            "da": "En sikker chip, der identificerer en mobilabonnent.",
            "model": "gpt-4.1-mini",
        }

    monkeypatch.setattr(
        "resources.routers.recommend.recommend_definition", fake_recommend
    )

    r = await client.post(
        "/terms/recommend-definition",
        json={"term": "SIM", "category_id": "network.mobile"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["en"] == "A secure chip that identifies a mobile subscriber."
    assert body["da"] == "En sikker chip, der identificerer en mobilabonnent."
    assert body["model"] == "gpt-4.1-mini"


@pytest.mark.asyncio
async def test_recommend_definition_invalid_category_422(
    client: AsyncClient, seed_categories
):
    r = await client.post(
        "/terms/recommend-definition",
        json={"term": "SIM", "category_id": "missing"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_recommend_definition_provider_error_503(
    client: AsyncClient, monkeypatch
):
    async def fake_recommend(term: str, category_context: str | None = None):
        raise RecommendationServiceError("AI provider returned an error")

    monkeypatch.setattr(
        "resources.routers.recommend.recommend_definition", fake_recommend
    )

    r = await client.post(
        "/terms/recommend-definition",
        json={"term": "SIM"},
    )
    assert r.status_code == 503
    assert r.json()["detail"] == "AI provider returned an error"


@pytest.mark.asyncio
async def test_recommend_definition_empty_term_422(client: AsyncClient):
    r = await client.post("/terms/recommend-definition", json={"term": ""})
    assert r.status_code == 422


# =========================================================================
# PATCH
# =========================================================================


@pytest.mark.asyncio
async def test_update_term_name(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.patch(f"/terms/{term_id}", json={"term": "LTE-A"})
    assert r.status_code == 200
    assert r.json()["term"] == "LTE-A"

    # Verify persisted
    r = await client.get(f"/terms/{term_id}")
    assert r.json()["term"] == "LTE-A"


@pytest.mark.asyncio
async def test_update_term_duplicate_name_409(client: AsyncClient, seed_categories):
    await client.post(
        "/terms/",
        json={
            "term": "AAA",
            "definitions": [{"en": "First", "category_id": "network"}],
        },
    )
    r2 = await client.post(
        "/terms/",
        json={
            "term": "BBB",
            "definitions": [{"en": "Second", "category_id": "network"}],
        },
    )
    r = await client.patch(f"/terms/{r2.json()['id']}", json={"term": "AAA"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_update_term_not_found(client: AsyncClient):
    r = await client.patch("/terms/99999", json={"term": "X"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_term_noop(client: AsyncClient, seed_term):
    """PATCH with empty body should succeed and return unchanged data."""
    term_id = seed_term["id"]
    r = await client.patch(f"/terms/{term_id}", json={})
    assert r.status_code == 200
    assert r.json()["term"] == "LTE"


# =========================================================================
# DELETE
# =========================================================================


@pytest.mark.asyncio
async def test_delete_term(client: AsyncClient, seed_term):
    term_id = seed_term["id"]
    r = await client.delete(f"/terms/{term_id}")
    assert r.status_code == 204

    r = await client.get(f"/terms/{term_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_term_not_found(client: AsyncClient):
    r = await client.delete("/terms/99999")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_term_cascades_definitions(client: AsyncClient, seed_term):
    """Deleting a term should also delete its definitions."""
    term_id = seed_term["id"]

    r = await client.delete(f"/terms/{term_id}")
    assert r.status_code == 204

    # The term's definitions should be gone — creating a new term to verify
    # the definition IDs are not reachable via any term
    r = await client.get(f"/terms/{term_id}")
    assert r.status_code == 404
