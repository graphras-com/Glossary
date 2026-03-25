import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.main import app, lifespan
from app.routers.backup import backup, restore
from app.routers.categories import (
    create_category,
    delete_category,
    get_category,
    list_categories,
    update_category,
)
from app.routers.terms import (
    add_definition,
    create_term,
    delete_definition,
    delete_term,
    get_term,
    list_terms,
    update_definition,
    update_term,
)
from app.schemas import (
    BackupCategory,
    BackupDefinition,
    BackupPayload,
    BackupTerm,
    CategoryCreate,
    CategoryUpdate,
    DefinitionCreate,
    DefinitionUpdate,
    TermCreate,
    TermUpdate,
)


@pytest.mark.asyncio
async def test_categories_router_branches(db_session, monkeypatch):
    root = await create_category(
        CategoryCreate(id="network", parent_id=None, label="Network"), db_session
    )
    child = await create_category(
        CategoryCreate(id="network.mobile", parent_id="network", label="Mobile"),
        db_session,
    )

    listed = await list_categories(db_session)
    assert [c.id for c in listed] == ["network", "network.mobile"]

    fetched = await get_category("network.mobile", db_session)
    assert fetched.id == child.id

    with pytest.raises(HTTPException) as dup_err:
        await create_category(
            CategoryCreate(id="network", parent_id=None, label="Duplicate"), db_session
        )
    assert dup_err.value.status_code == 409

    with pytest.raises(HTTPException) as bad_parent_err:
        await create_category(
            CategoryCreate(id="orphan", parent_id="missing", label="Orphan"), db_session
        )
    assert bad_parent_err.value.status_code == 422

    updated = await update_category(
        root.id,
        CategoryUpdate(label="Networking", parent_id=None),
        db_session,
    )
    assert updated.label == "Networking"

    with pytest.raises(HTTPException) as missing_update_err:
        await update_category("missing", CategoryUpdate(label="x"), db_session)
    assert missing_update_err.value.status_code == 404

    with pytest.raises(HTTPException) as bad_parent_update_err:
        await update_category(
            child.id, CategoryUpdate(parent_id="missing-parent"), db_session
        )
    assert bad_parent_update_err.value.status_code == 422

    with pytest.raises(HTTPException) as missing_delete_err:
        await delete_category("missing", db_session)
    assert missing_delete_err.value.status_code == 404

    await create_term(
        TermCreate(
            term="Core",
            definitions=[
                DefinitionCreate(en="Core network", da=None, category_id=root.id)
            ],
        ),
        db_session,
    )

    await delete_category(child.id, db_session)

    async def fail_commit():
        raise IntegrityError("DELETE", {}, Exception("fk"))

    monkeypatch.setattr(db_session, "commit", fail_commit)

    with pytest.raises(HTTPException) as referenced_delete_err:
        await delete_category(root.id, db_session)
    assert referenced_delete_err.value.status_code == 409

    with pytest.raises(HTTPException) as missing_get_err:
        await get_category("network.mobile", db_session)
    assert missing_get_err.value.status_code == 404


@pytest.mark.asyncio
async def test_terms_and_definitions_router_branches(db_session):
    await create_category(
        CategoryCreate(id="network", parent_id=None, label="Network"), db_session
    )
    await create_category(
        CategoryCreate(id="network.mobile", parent_id="network", label="Mobile"),
        db_session,
    )

    term = await create_term(
        TermCreate(
            term="LTE",
            definitions=[
                DefinitionCreate(
                    en="Long Term Evolution",
                    da="Long Term Evolution",
                    category_id="network.mobile",
                )
            ],
        ),
        db_session,
    )

    listed = await list_terms(q="LTE", category="network.mobile", db=db_session)
    assert len(listed) == 1
    assert listed[0].term == "LTE"

    fetched = await get_term(term.id, db_session)
    assert fetched.id == term.id

    with pytest.raises(HTTPException) as missing_get_err:
        await get_term(99999, db_session)
    assert missing_get_err.value.status_code == 404

    with pytest.raises(HTTPException) as dup_create_err:
        await create_term(
            TermCreate(
                term="LTE",
                definitions=[
                    DefinitionCreate(en="dup", da=None, category_id="network")
                ],
            ),
            db_session,
        )
    assert dup_create_err.value.status_code == 409

    with pytest.raises(HTTPException) as bad_category_err:
        await create_term(
            TermCreate(
                term="Ghost",
                definitions=[
                    DefinitionCreate(en="Bad ref", da=None, category_id="missing")
                ],
            ),
            db_session,
        )
    assert bad_category_err.value.status_code == 422

    second = await create_term(
        TermCreate(
            term="MPLS",
            definitions=[
                DefinitionCreate(en="Label switching", da=None, category_id="network")
            ],
        ),
        db_session,
    )

    with pytest.raises(HTTPException) as dup_update_err:
        await update_term(second.id, TermUpdate(term="LTE"), db_session)
    assert dup_update_err.value.status_code == 409

    renamed = await update_term(term.id, TermUpdate(term="LTE-A"), db_session)
    assert renamed.term == "LTE-A"

    with pytest.raises(HTTPException) as missing_update_err:
        await update_term(99999, TermUpdate(term="x"), db_session)
    assert missing_update_err.value.status_code == 404

    created_defn = await add_definition(
        term.id,
        DefinitionCreate(en="4G RAN", da=None, category_id="network"),
        db_session,
    )
    assert created_defn.term_id == term.id

    with pytest.raises(HTTPException) as missing_term_defn_err:
        await add_definition(
            99999,
            DefinitionCreate(en="x", da=None, category_id="network"),
            db_session,
        )
    assert missing_term_defn_err.value.status_code == 404

    with pytest.raises(HTTPException) as missing_cat_defn_err:
        await add_definition(
            term.id,
            DefinitionCreate(en="x", da=None, category_id="missing"),
            db_session,
        )
    assert missing_cat_defn_err.value.status_code == 422

    updated_defn = await update_definition(
        term.id,
        created_defn.id,
        DefinitionUpdate(en="4G Radio Access"),
        db_session,
    )
    assert updated_defn.en == "4G Radio Access"

    with pytest.raises(HTTPException) as missing_defn_err:
        await update_definition(term.id, 99999, DefinitionUpdate(en="x"), db_session)
    assert missing_defn_err.value.status_code == 404

    with pytest.raises(HTTPException) as missing_defn_cat_err:
        await update_definition(
            term.id,
            created_defn.id,
            DefinitionUpdate(category_id="missing"),
            db_session,
        )
    assert missing_defn_cat_err.value.status_code == 422

    with pytest.raises(HTTPException) as missing_delete_defn_err:
        await delete_definition(term.id, 99999, db_session)
    assert missing_delete_defn_err.value.status_code == 404

    await delete_definition(term.id, created_defn.id, db_session)

    with pytest.raises(HTTPException) as missing_delete_term_err:
        await delete_term(99999, db_session)
    assert missing_delete_term_err.value.status_code == 404

    await delete_term(second.id, db_session)


@pytest.mark.asyncio
async def test_backup_router_branches(db_session):
    payload = BackupPayload(
        version=1,
        categories=[
            BackupCategory(id="core.mobile", parent_id="core", label="Mobile"),
            BackupCategory(id="core", parent_id=None, label="Core"),
        ],
        terms=[
            BackupTerm(
                term="IMS",
                definitions=[
                    BackupDefinition(
                        en="IP Multimedia Subsystem",
                        da=None,
                        category_id="core.mobile",
                    )
                ],
            )
        ],
    )

    restored = await restore(payload, db_session)
    assert restored["status"] == "ok"
    assert restored["categories"] == 2
    assert restored["terms"] == 1

    dumped = await backup(db_session)
    assert dumped.version == 1
    assert len(dumped.categories) == 2
    assert dumped.terms[0].term == "IMS"


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

    async def fake_seed(_db):
        calls["seed"] += 1

    monkeypatch.setattr("app.main.engine", FakeEngine())
    monkeypatch.setattr("app.main.async_session", lambda: FakeSession())
    monkeypatch.setattr("app.main.seed", fake_seed)

    async with lifespan(app):
        pass

    assert calls == {"create_all": 1, "seed": 1, "dispose": 1}


@pytest.mark.asyncio
async def test_get_db_dependency_yields_session():
    gen = get_db()
    session = await anext(gen)
    assert session is not None
    await gen.aclose()
