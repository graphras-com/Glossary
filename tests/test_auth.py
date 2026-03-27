"""Comprehensive tests for the authentication system.

Tests cover:
- Unauthenticated requests are rejected (401)
- Invalid/malformed tokens are rejected (401)
- Scope validation (403)
- Role validation (403)
- Health endpoint remains unauthenticated
- AUTH_DISABLED mode returns synthetic user
- Token payload construction
"""

import time
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth import (
    TokenPayload,
    _JWKSCache,
    _validate_token,
    auth_settings,
    require_auth,
    require_role,
    require_scope,
)
from app.database import get_db
from app.main import app
from app.models import Base

# ---------------------------------------------------------------------------
# RSA key pair for test JWT signing
# ---------------------------------------------------------------------------

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()

TEST_KID = "test-key-id-001"
TEST_TENANT = "11111111-1111-1111-1111-111111111111"
TEST_AUDIENCE = "api://test-api-client-id"
TEST_ISSUER = f"https://login.microsoftonline.com/{TEST_TENANT}/v2.0"


def _make_token(
    claims: dict | None = None,
    *,
    kid: str = TEST_KID,
    algorithm: str = "RS256",
    expired: bool = False,
    missing_sub: bool = False,
    wrong_audience: bool = False,
    wrong_issuer: bool = False,
    wrong_tenant: bool = False,
) -> str:
    """Create a signed JWT for testing."""
    now = int(time.time())
    payload = {
        "sub": "user-123",
        "name": "Test User",
        "preferred_username": "test@company.com",
        "oid": "oid-123",
        "tid": TEST_TENANT,
        "scp": "access_as_user",
        "roles": ["Glossary.Reader"],
        "aud": TEST_AUDIENCE,
        "iss": TEST_ISSUER,
        "iat": now - 60,
        "nbf": now - 60,
        "exp": now + 3600,
    }

    if expired:
        payload["exp"] = now - 100
        payload["iat"] = now - 3700
        payload["nbf"] = now - 3700

    if missing_sub:
        del payload["sub"]

    if wrong_audience:
        payload["aud"] = "api://wrong-audience"

    if wrong_issuer:
        payload["iss"] = "https://evil.example.com/v2.0"

    if wrong_tenant:
        payload["tid"] = "99999999-9999-9999-9999-999999999999"

    if claims:
        payload.update(claims)

    headers = {"kid": kid}
    return jwt.encode(payload, _private_key, algorithm=algorithm, headers=headers)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def engine():
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture()
async def unauthenticated_client(engine):
    """Client with NO auth override — real auth dependency is active."""
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    # Explicitly remove any auth override to test real auth behavior
    app.dependency_overrides.pop(require_auth, None)

    # Ensure auth is NOT disabled for these tests
    original_disabled = auth_settings.auth_disabled
    original_tenant = auth_settings.tenant_id
    original_audience = auth_settings.api_audience
    auth_settings.auth_disabled = False
    auth_settings.tenant_id = TEST_TENANT
    auth_settings.api_audience = TEST_AUDIENCE

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    auth_settings.auth_disabled = original_disabled
    auth_settings.tenant_id = original_tenant
    auth_settings.api_audience = original_audience
    app.dependency_overrides.clear()


def _mock_jwks_cache():
    """Return a patched JWKS cache that serves our test public key."""
    cache = _JWKSCache()
    cache.keys[TEST_KID] = _public_key
    return cache


# =========================================================================
# Health endpoint (unauthenticated)
# =========================================================================


@pytest.mark.asyncio
async def test_health_no_auth_required(unauthenticated_client: AsyncClient):
    """GET /health should work without any token."""
    r = await unauthenticated_client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# =========================================================================
# Missing token → 401
# =========================================================================


@pytest.mark.asyncio
async def test_categories_no_token_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.get("/categories/")
    assert r.status_code == 401
    assert "Missing authentication token" in r.json()["detail"]


@pytest.mark.asyncio
async def test_terms_no_token_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.get("/terms/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_backup_no_token_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.get("/backup/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_post_no_token_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.post(
        "/categories/", json={"id": "test", "label": "Test"}
    )
    assert r.status_code == 401


# =========================================================================
# Invalid tokens → 401
# =========================================================================


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_expired_token_401(unauthenticated_client: AsyncClient):
    token = _make_token(expired=True)
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401
    assert "expired" in r.json()["detail"].lower()


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_wrong_audience_401(unauthenticated_client: AsyncClient):
    token = _make_token(wrong_audience=True)
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_wrong_issuer_401(unauthenticated_client: AsyncClient):
    token = _make_token(wrong_issuer=True)
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_wrong_tenant_401(unauthenticated_client: AsyncClient):
    token = _make_token(wrong_tenant=True)
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_malformed_token_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": "Bearer not.a.valid.jwt"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_empty_bearer_401(unauthenticated_client: AsyncClient):
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": "Bearer "},
    )
    assert r.status_code == 401


# =========================================================================
# Valid token → 200
# =========================================================================


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_valid_token_200(unauthenticated_client: AsyncClient):
    token = _make_token()
    r = await unauthenticated_client.get(
        "/categories/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_valid_token_terms_200(unauthenticated_client: AsyncClient):
    token = _make_token()
    r = await unauthenticated_client.get(
        "/terms/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200


# =========================================================================
# Scope validation
# =========================================================================


@pytest.mark.asyncio
async def test_require_scope_passes():
    """require_scope should pass when token has required scope."""
    token = TokenPayload(
        sub="u1",
        name="User",
        email="u@x.com",
        oid="oid",
        tid="tid",
        scopes=["access_as_user", "read"],
        roles=[],
        raw={},
    )
    checker = require_scope("access_as_user")
    result = await checker(token)
    assert result.sub == "u1"


@pytest.mark.asyncio
async def test_require_scope_fails():
    """require_scope should raise 403 when scope is missing."""
    from fastapi import HTTPException

    token = TokenPayload(
        sub="u1",
        name="User",
        email="u@x.com",
        oid="oid",
        tid="tid",
        scopes=["read"],
        roles=[],
        raw={},
    )
    checker = require_scope("access_as_user")
    with pytest.raises(HTTPException) as exc_info:
        await checker(token)
    assert exc_info.value.status_code == 403
    assert "Insufficient scope" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_scope_multiple():
    """require_scope with multiple scopes should require ALL of them."""
    from fastapi import HTTPException

    token = TokenPayload(
        sub="u1",
        name="User",
        email="u@x.com",
        oid="oid",
        tid="tid",
        scopes=["access_as_user"],
        roles=[],
        raw={},
    )
    checker = require_scope("access_as_user", "admin")
    with pytest.raises(HTTPException) as exc_info:
        await checker(token)
    assert exc_info.value.status_code == 403


# =========================================================================
# Role validation
# =========================================================================


@pytest.mark.asyncio
async def test_require_role_passes():
    """require_role should pass when token has one of the required roles."""
    token = TokenPayload(
        sub="u1",
        name="User",
        email="u@x.com",
        oid="oid",
        tid="tid",
        scopes=[],
        roles=["Glossary.Admin"],
        raw={},
    )
    checker = require_role("Glossary.Admin", "Glossary.Editor")
    result = await checker(token)
    assert result.sub == "u1"


@pytest.mark.asyncio
async def test_require_role_fails():
    """require_role should raise 403 when no matching role."""
    from fastapi import HTTPException

    token = TokenPayload(
        sub="u1",
        name="User",
        email="u@x.com",
        oid="oid",
        tid="tid",
        scopes=[],
        roles=["Glossary.Reader"],
        raw={},
    )
    checker = require_role("Glossary.Admin")
    with pytest.raises(HTTPException) as exc_info:
        await checker(token)
    assert exc_info.value.status_code == 403
    assert "Insufficient role" in exc_info.value.detail


# =========================================================================
# Restore endpoint requires Glossary.Admin role
# =========================================================================


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_restore_requires_admin_role(unauthenticated_client: AsyncClient):
    """POST /backup/restore should require the Glossary.Admin role."""
    token = _make_token(claims={"roles": ["Glossary.Reader"]})
    r = await unauthenticated_client.post(
        "/backup/restore",
        headers={"Authorization": f"Bearer {token}"},
        json={"version": 1, "categories": [], "terms": []},
    )
    assert r.status_code == 403
    assert "Insufficient role" in r.json()["detail"]


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_restore_admin_allowed(unauthenticated_client: AsyncClient):
    """POST /backup/restore should succeed for Glossary.Admin."""
    token = _make_token(claims={"roles": ["Glossary.Admin"]})
    r = await unauthenticated_client.post(
        "/backup/restore",
        headers={"Authorization": f"Bearer {token}"},
        json={"version": 1, "categories": [], "terms": []},
    )
    assert r.status_code == 200


# =========================================================================
# AUTH_DISABLED mode
# =========================================================================


@pytest.mark.asyncio
async def test_auth_disabled_mode(engine):
    """When AUTH_DISABLED=true, endpoints should work without tokens."""
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    original_disabled = auth_settings.auth_disabled
    auth_settings.auth_disabled = True

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides.pop(require_auth, None)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/categories/")
        assert r.status_code == 200

    auth_settings.auth_disabled = original_disabled
    app.dependency_overrides.clear()


# =========================================================================
# TokenPayload construction
# =========================================================================


def test_token_payload_fields():
    """TokenPayload should correctly store all fields."""
    tp = TokenPayload(
        sub="s",
        name="n",
        email="e",
        oid="o",
        tid="t",
        scopes=["a", "b"],
        roles=["r"],
        raw={"x": 1},
    )
    assert tp.sub == "s"
    assert tp.name == "n"
    assert tp.email == "e"
    assert tp.oid == "o"
    assert tp.tid == "t"
    assert tp.scopes == ["a", "b"]
    assert tp.roles == ["r"]
    assert tp.raw == {"x": 1}


# =========================================================================
# _validate_token unit tests
# =========================================================================


@pytest.mark.asyncio
@patch("app.auth._jwks_cache", _mock_jwks_cache())
async def test_validate_token_extracts_claims():
    """_validate_token should extract all expected claims from a valid token."""
    original_tenant = auth_settings.tenant_id
    original_audience = auth_settings.api_audience
    auth_settings.tenant_id = TEST_TENANT
    auth_settings.api_audience = TEST_AUDIENCE

    token = _make_token(
        claims={
            "name": "Jane Doe",
            "preferred_username": "jane@company.com",
            "scp": "access_as_user read",
            "roles": ["Glossary.Admin", "Glossary.Reader"],
        }
    )
    result = await _validate_token(token)
    assert result.sub == "user-123"
    assert result.name == "Jane Doe"
    assert result.email == "jane@company.com"
    assert result.tid == TEST_TENANT
    assert "access_as_user" in result.scopes
    assert "read" in result.scopes
    assert "Glossary.Admin" in result.roles

    auth_settings.tenant_id = original_tenant
    auth_settings.api_audience = original_audience


@pytest.mark.asyncio
async def test_validate_token_unknown_kid():
    """Token with an unknown kid should fail with 401."""
    from fastapi import HTTPException

    original_tenant = auth_settings.tenant_id
    original_audience = auth_settings.api_audience
    auth_settings.tenant_id = TEST_TENANT
    auth_settings.api_audience = TEST_AUDIENCE

    # Create a cache that returns None for unknown kids without hitting the network
    cache = _JWKSCache()
    cache.keys[TEST_KID] = _public_key

    async def _no_network_refresh(self):
        """Override refresh to avoid hitting real Microsoft endpoint."""
        pass

    token = _make_token(kid="unknown-kid")
    with (
        patch.object(_JWKSCache, "_refresh", _no_network_refresh),
        patch("app.auth._jwks_cache", cache),
        pytest.raises(HTTPException) as exc_info,
    ):
        await _validate_token(token)
    assert exc_info.value.status_code == 401

    auth_settings.tenant_id = original_tenant
    auth_settings.api_audience = original_audience


@pytest.mark.asyncio
async def test_validate_token_garbage():
    """Completely invalid JWT string should fail."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await _validate_token("this-is-not-a-jwt")
    assert exc_info.value.status_code == 401
