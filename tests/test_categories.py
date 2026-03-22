import pytest
from httpx import AsyncClient

# =========================================================================
# LIST
# =========================================================================


@pytest.mark.asyncio
async def test_list_categories_empty(client: AsyncClient):
    r = await client.get("/categories/")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_categories_returns_all(client: AsyncClient, seed_categories):
    r = await client.get("/categories/")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert "network" in ids
    assert "network.mobile" in ids
    assert "commercial" in ids


@pytest.mark.asyncio
async def test_list_categories_ordered_by_id(client: AsyncClient, seed_categories):
    r = await client.get("/categories/")
    ids = [c["id"] for c in r.json()]
    assert ids == sorted(ids)


# =========================================================================
# GET
# =========================================================================


@pytest.mark.asyncio
async def test_get_category(client: AsyncClient, seed_categories):
    r = await client.get("/categories/network.mobile")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "network.mobile"
    assert body["parent_id"] == "network"
    assert body["label"] == "Mobile"


@pytest.mark.asyncio
async def test_get_category_not_found(client: AsyncClient):
    r = await client.get("/categories/nonexistent")
    assert r.status_code == 404


# =========================================================================
# CREATE
# =========================================================================


@pytest.mark.asyncio
async def test_create_category_top_level(client: AsyncClient):
    r = await client.post(
        "/categories/",
        json={"id": "operations", "parent_id": None, "label": "Operations"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == "operations"
    assert body["parent_id"] is None
    assert body["label"] == "Operations"


@pytest.mark.asyncio
async def test_create_category_with_parent(client: AsyncClient, seed_categories):
    r = await client.post(
        "/categories/",
        json={"id": "network.services", "parent_id": "network", "label": "Services"},
    )
    assert r.status_code == 201
    assert r.json()["parent_id"] == "network"


@pytest.mark.asyncio
async def test_create_category_duplicate_409(client: AsyncClient, seed_categories):
    r = await client.post(
        "/categories/", json={"id": "network", "parent_id": None, "label": "Duplicate"}
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_create_category_invalid_parent_422(client: AsyncClient):
    r = await client.post(
        "/categories/",
        json={"id": "child.orphan", "parent_id": "ghost", "label": "Orphan"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_category_empty_id_422(client: AsyncClient):
    r = await client.post(
        "/categories/", json={"id": "", "parent_id": None, "label": "Bad"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_category_empty_label_422(client: AsyncClient):
    r = await client.post(
        "/categories/", json={"id": "ok", "parent_id": None, "label": ""}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_category_missing_fields_422(client: AsyncClient):
    r = await client.post("/categories/", json={"id": "only_id"})
    assert r.status_code == 422


# =========================================================================
# PATCH
# =========================================================================


@pytest.mark.asyncio
async def test_update_category_label(client: AsyncClient, seed_categories):
    r = await client.patch("/categories/network", json={"label": "Networking"})
    assert r.status_code == 200
    assert r.json()["label"] == "Networking"
    assert r.json()["id"] == "network"


@pytest.mark.asyncio
async def test_update_category_parent(client: AsyncClient, seed_categories):
    r = await client.patch(
        "/categories/network.mobile", json={"parent_id": "commercial"}
    )
    assert r.status_code == 200
    assert r.json()["parent_id"] == "commercial"


@pytest.mark.asyncio
async def test_update_category_clear_parent(client: AsyncClient, seed_categories):
    r = await client.patch("/categories/network.mobile", json={"parent_id": None})
    assert r.status_code == 200
    assert r.json()["parent_id"] is None


@pytest.mark.asyncio
async def test_update_category_not_found(client: AsyncClient):
    r = await client.patch("/categories/ghost", json={"label": "X"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_category_invalid_parent_422(client: AsyncClient, seed_categories):
    r = await client.patch(
        "/categories/network.mobile", json={"parent_id": "nonexistent"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_update_category_noop(client: AsyncClient, seed_categories):
    """PATCH with empty body should succeed and return unchanged data."""
    r = await client.patch("/categories/network", json={})
    assert r.status_code == 200
    assert r.json()["label"] == "Network"


# =========================================================================
# DELETE
# =========================================================================


@pytest.mark.asyncio
async def test_delete_category(client: AsyncClient, seed_categories):
    r = await client.delete("/categories/network.access")
    assert r.status_code == 204

    r = await client.get("/categories/network.access")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_category_not_found(client: AsyncClient):
    r = await client.delete("/categories/nonexistent")
    assert r.status_code == 404
