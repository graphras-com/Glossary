import pytest
from httpx import AsyncClient

# =========================================================================
# BACKUP (GET /backup/)
# =========================================================================


@pytest.mark.asyncio
async def test_backup_empty_database(client: AsyncClient):
    """Backup of an empty DB returns version and empty arrays."""
    r = await client.get("/backup/")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == 1
    assert body["categories"] == []
    assert body["terms"] == []


@pytest.mark.asyncio
async def test_backup_includes_all_data(client: AsyncClient, seed_term):
    """Backup includes categories, terms, and definitions created by fixtures."""
    r = await client.get("/backup/")
    assert r.status_code == 200
    body = r.json()
    assert len(body["categories"]) == 4  # seed_categories creates 4
    assert len(body["terms"]) == 1
    assert body["terms"][0]["term"] == "LTE"
    assert len(body["terms"][0]["definitions"]) == 2


@pytest.mark.asyncio
async def test_backup_category_fields(client: AsyncClient, seed_categories):
    """Each backed-up category has id, parent_id, and label."""
    r = await client.get("/backup/")
    cats = {c["id"]: c for c in r.json()["categories"]}
    assert cats["network"]["parent_id"] is None
    assert cats["network"]["label"] == "Network"
    assert cats["network.mobile"]["parent_id"] == "network"


# =========================================================================
# RESTORE (POST /backup/restore)
# =========================================================================


@pytest.mark.asyncio
async def test_restore_replaces_all_data(client: AsyncClient, seed_term):
    """Restore wipes existing data and inserts the new payload."""
    payload = {
        "version": 1,
        "categories": [
            {"id": "finance", "parent_id": None, "label": "Finance"},
        ],
        "terms": [
            {
                "term": "ROI",
                "definitions": [
                    {"en": "Return on Investment", "da": None, "category_id": "finance"}
                ],
            }
        ],
    }
    r = await client.post("/backup/restore", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["categories"] == 1
    assert body["terms"] == 1

    # Old data should be gone
    r = await client.get("/categories/network")
    assert r.status_code == 404

    # New data should exist
    r = await client.get("/terms/")
    terms = r.json()
    assert len(terms) == 1
    assert terms[0]["term"] == "ROI"


@pytest.mark.asyncio
async def test_restore_empty_payload(client: AsyncClient, seed_term):
    """Restoring empty arrays wipes all data."""
    payload = {"version": 1, "categories": [], "terms": []}
    r = await client.post("/backup/restore", json=payload)
    assert r.status_code == 200

    r = await client.get("/categories/")
    assert r.json() == []

    r = await client.get("/terms/")
    assert r.json() == []


@pytest.mark.asyncio
async def test_restore_with_hierarchical_categories(client: AsyncClient):
    """Restore correctly handles parent-before-child ordering."""
    payload = {
        "version": 1,
        "categories": [
            # Intentionally list child before parent to test topological sort
            {"id": "tech.cloud", "parent_id": "tech", "label": "Cloud"},
            {"id": "tech", "parent_id": None, "label": "Technology"},
        ],
        "terms": [],
    }
    r = await client.post("/backup/restore", json=payload)
    assert r.status_code == 200
    assert r.json()["categories"] == 2

    r = await client.get("/categories/tech.cloud")
    assert r.status_code == 200
    assert r.json()["parent_id"] == "tech"


@pytest.mark.asyncio
async def test_backup_roundtrip(client: AsyncClient, seed_term):
    """Export then re-import should produce the same data."""
    # Export
    r = await client.get("/backup/")
    assert r.status_code == 200
    backup_data = r.json()

    # Restore (which wipes and re-creates)
    r = await client.post("/backup/restore", json=backup_data)
    assert r.status_code == 200

    # Export again and compare
    r = await client.get("/backup/")
    restored = r.json()
    assert len(restored["categories"]) == len(backup_data["categories"])
    assert len(restored["terms"]) == len(backup_data["terms"])
    assert restored["terms"][0]["term"] == backup_data["terms"][0]["term"]


# =========================================================================
# DELETE CATEGORY WITH DEFINITION FK REFERENCE
# =========================================================================


@pytest.mark.asyncio
async def test_delete_category_used_by_definition(client: AsyncClient, seed_term):
    """Deleting a category referenced by definitions returns 409."""
    # network.mobile is used by the seed_term definition
    r = await client.delete("/categories/network.mobile")
    assert r.status_code == 409
    assert "referenced" in r.json()["detail"].lower()
