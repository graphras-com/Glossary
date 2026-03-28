import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth import TokenPayload, require_auth
from app.database import get_db
from app.main import app
from app.models import Base

# ---------------------------------------------------------------------------
# Auth override - all existing tests run as an authenticated admin user
# ---------------------------------------------------------------------------

_TEST_USER = TokenPayload(
    sub="test-user-id",
    name="Test User",
    email="test@example.com",
    oid="00000000-0000-0000-0000-000000000001",
    tid="test-tenant-id",
    scopes=["access_as_user"],
    roles=["Glossary.Admin"],
    raw={},
)


async def _override_require_auth() -> TokenPayload:
    """Bypass real JWT validation in tests."""
    return _TEST_USER


@pytest.fixture()
async def engine():
    """Create an in-memory SQLite engine for each test."""
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture()
async def db_session(engine):
    """Provide an async session bound to the in-memory DB."""
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest.fixture()
async def client(engine):
    """
    HTTP test client with the get_db dependency overridden to use the
    in-memory SQLite database, and auth bypassed.
    """
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[require_auth] = _override_require_auth
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Reusable helpers - create seed data used by most test modules
# ---------------------------------------------------------------------------


@pytest.fixture()
async def seed_categories(client: AsyncClient) -> list[dict]:
    """Create a small set of categories and return their response bodies."""
    categories = [
        {"id": "network", "parent_id": None, "label": "Network"},
        {"id": "network.mobile", "parent_id": "network", "label": "Mobile"},
        {"id": "network.access", "parent_id": "network", "label": "Access"},
        {"id": "commercial", "parent_id": None, "label": "Commercial"},
    ]
    results = []
    for cat in categories:
        r = await client.post("/categories/", json=cat)
        assert r.status_code == 201
        results.append(r.json())
    return results


@pytest.fixture()
async def seed_term(client: AsyncClient, seed_categories) -> dict:
    """Create a single term with two definitions and return its response body."""
    payload = {
        "term": "LTE",
        "definitions": [
            {
                "en": "Long Term Evolution",
                "da": "Long Term Evolution (dansk)",
                "category_id": "network.mobile",
            },
            {
                "en": "A 4G radio access technology",
                "category_id": "network",
            },
        ],
    }
    r = await client.post("/terms/", json=payload)
    assert r.status_code == 201
    return r.json()
