"""Unit-level tests that exercise router and utility branches directly.

These tests call the HTTP endpoints via the test client rather than
importing internal router functions, making them compatible with the
generic CRUD framework.
"""

import pytest
from httpx import AsyncClient

from app.database import get_db
from app.main import app, lifespan


@pytest.mark.asyncio
async def test_categories_router_branches(client: AsyncClient):
    """Exercise all category CRUD branches through HTTP."""
    # Create root and child
    r = await client.post(
        "/categories/",
        json={"id": "network", "parent_id": None, "label": "Network"},
    )
    assert r.status_code == 201

    r = await client.post(
        "/categories/",
        json={"id": "network.mobile", "parent_id": "network", "label": "Mobile"},
    )
    assert r.status_code == 201

    # List
    r = await client.get("/categories/")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert "network" in ids
    assert "network.mobile" in ids

    # Get by ID
    r = await client.get("/categories/network.mobile")
    assert r.status_code == 200
    assert r.json()["id"] == "network.mobile"

    # Duplicate 409
    r = await client.post(
        "/categories/",
        json={"id": "network", "parent_id": None, "label": "Duplicate"},
    )
    assert r.status_code == 409

    # Bad parent 422
    r = await client.post(
        "/categories/",
        json={"id": "orphan", "parent_id": "missing", "label": "Orphan"},
    )
    assert r.status_code == 422

    # Update label
    r = await client.patch(
        "/categories/network",
        json={"label": "Networking", "parent_id": None},
    )
    assert r.status_code == 200
    assert r.json()["label"] == "Networking"

    # Update missing 404
    r = await client.patch("/categories/missing", json={"label": "x"})
    assert r.status_code == 404

    # Update with invalid parent 422
    r = await client.patch(
        "/categories/network.mobile",
        json={"parent_id": "missing-parent"},
    )
    assert r.status_code == 422

    # Delete missing 404
    r = await client.delete("/categories/missing")
    assert r.status_code == 404

    # Create a term referencing the category to test protected delete
    r = await client.post(
        "/terms/",
        json={
            "term": "Core",
            "definitions": [
                {"en": "Core network", "da": None, "category_id": "network"}
            ],
        },
    )
    assert r.status_code == 201

    # Delete unreferenced child
    r = await client.delete("/categories/network.mobile")
    assert r.status_code == 204

    # Delete referenced parent (409)
    r = await client.delete("/categories/network")
    assert r.status_code == 409

    # Get deleted category (404)
    r = await client.get("/categories/network.mobile")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_terms_and_definitions_router_branches(client: AsyncClient):
    """Exercise all term and definition CRUD branches through HTTP."""
    # Setup categories
    await client.post(
        "/categories/",
        json={"id": "network", "parent_id": None, "label": "Network"},
    )
    await client.post(
        "/categories/",
        json={"id": "network.mobile", "parent_id": "network", "label": "Mobile"},
    )

    # Create term
    r = await client.post(
        "/terms/",
        json={
            "term": "LTE",
            "definitions": [
                {
                    "en": "Long Term Evolution",
                    "da": "Long Term Evolution",
                    "category_id": "network.mobile",
                }
            ],
        },
    )
    assert r.status_code == 201
    term = r.json()
    term_id = term["id"]

    # List with search and category filter
    r = await client.get("/terms/?q=LTE&category=network.mobile")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["term"] == "LTE"

    # Get by ID
    r = await client.get(f"/terms/{term_id}")
    assert r.status_code == 200
    assert r.json()["id"] == term_id

    # Get missing 404
    r = await client.get("/terms/99999")
    assert r.status_code == 404

    # Duplicate create 409
    r = await client.post(
        "/terms/",
        json={
            "term": "LTE",
            "definitions": [{"en": "dup", "da": None, "category_id": "network"}],
        },
    )
    assert r.status_code == 409

    # Create with bad category 422
    r = await client.post(
        "/terms/",
        json={
            "term": "Ghost",
            "definitions": [{"en": "Bad ref", "da": None, "category_id": "missing"}],
        },
    )
    assert r.status_code == 422

    # Create second term
    r = await client.post(
        "/terms/",
        json={
            "term": "MPLS",
            "definitions": [
                {"en": "Label switching", "da": None, "category_id": "network"}
            ],
        },
    )
    assert r.status_code == 201
    second = r.json()

    # Update to duplicate name 409
    r = await client.patch(f"/terms/{second['id']}", json={"term": "LTE"})
    assert r.status_code == 409

    # Rename
    r = await client.patch(f"/terms/{term_id}", json={"term": "LTE-A"})
    assert r.status_code == 200
    assert r.json()["term"] == "LTE-A"

    # Update missing 404
    r = await client.patch("/terms/99999", json={"term": "x"})
    assert r.status_code == 404

    # Add definition
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={"en": "4G RAN", "da": None, "category_id": "network"},
    )
    assert r.status_code == 201
    defn = r.json()
    assert defn["en"] == "4G RAN"

    # Add definition to missing term 404
    r = await client.post(
        "/terms/99999/definitions",
        json={"en": "x", "da": None, "category_id": "network"},
    )
    assert r.status_code == 404

    # Add definition with bad category 422
    r = await client.post(
        f"/terms/{term_id}/definitions",
        json={"en": "x", "da": None, "category_id": "missing"},
    )
    assert r.status_code == 422

    # Update definition
    r = await client.patch(
        f"/terms/{term_id}/definitions/{defn['id']}",
        json={"en": "4G Radio Access"},
    )
    assert r.status_code == 200
    assert r.json()["en"] == "4G Radio Access"

    # Update missing definition 404
    r = await client.patch(
        f"/terms/{term_id}/definitions/99999",
        json={"en": "x"},
    )
    assert r.status_code == 404

    # Update definition with bad category 422
    r = await client.patch(
        f"/terms/{term_id}/definitions/{defn['id']}",
        json={"category_id": "missing"},
    )
    assert r.status_code == 422

    # Delete missing definition 404
    r = await client.delete(f"/terms/{term_id}/definitions/99999")
    assert r.status_code == 404

    # Delete definition
    r = await client.delete(f"/terms/{term_id}/definitions/{defn['id']}")
    assert r.status_code == 204

    # Delete missing term 404
    r = await client.delete("/terms/99999")
    assert r.status_code == 404

    # Delete second term
    r = await client.delete(f"/terms/{second['id']}")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_backup_router_branches(client: AsyncClient):
    """Exercise backup and restore through HTTP."""
    payload = {
        "version": 1,
        "categories": [
            {"id": "core.mobile", "parent_id": "core", "label": "Mobile"},
            {"id": "core", "parent_id": None, "label": "Core"},
        ],
        "terms": [
            {
                "term": "IMS",
                "definitions": [
                    {
                        "en": "IP Multimedia Subsystem",
                        "da": None,
                        "category_id": "core.mobile",
                    }
                ],
            }
        ],
    }

    r = await client.post("/backup/restore", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["categories"] == 2
    assert body["terms"] == 1

    r = await client.get("/backup/")
    assert r.status_code == 200
    backup_data = r.json()
    assert backup_data["version"] == 1
    assert len(backup_data["categories"]) == 2
    assert backup_data["terms"][0]["term"] == "IMS"


@pytest.mark.asyncio
async def test_lifespan_runs_startup_and_shutdown(monkeypatch):
    calls = {"create_all": 0, "seed": 0, "dispose": 0}

    class FakeConn:
        async def run_sync(self, fn):
            calls["create_all"] += 1

    class FakeBegin:
        async def __aenter__(self):
            return FakeConn()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeEngine:
        def begin(self):
            return FakeBegin()

        async def dispose(self):
            calls["dispose"] += 1

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def fake_seed(_db, _registry, _seed_file):
        calls["seed"] += 1

    monkeypatch.setattr("app.main.engine", FakeEngine())
    monkeypatch.setattr("app.main.async_session", lambda: FakeSession())
    monkeypatch.setattr("app.main.seed_from_file", fake_seed)

    async with lifespan(app):
        pass

    assert calls == {"create_all": 1, "seed": 1, "dispose": 1}


@pytest.mark.asyncio
async def test_get_db_dependency_yields_session():
    gen = get_db()
    session = await anext(gen)
    assert session is not None
    await gen.aclose()
