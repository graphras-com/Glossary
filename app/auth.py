"""Microsoft Entra ID (Azure AD) JWT authentication for FastAPI.

Validates access tokens issued by Entra ID using OIDC-compliant JWT
verification: fetches JWKS from Microsoft's discovery endpoint, validates
signature (RS256), and checks iss, aud, exp, nbf, and tid claims.

Provides reusable FastAPI dependencies for:
- require_auth: ensures a valid Bearer token is present
- require_scope: validates the ``scp`` claim contains required scopes
- require_role: validates the ``roles`` claim contains required app roles
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Annotated

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration (loaded from environment variables)
# ---------------------------------------------------------------------------


class AuthSettings(BaseSettings):
    """Auth-related settings loaded from environment variables."""

    tenant_id: str = ""
    api_audience: str = ""
    # Allow disabling auth entirely (useful for local development without Entra)
    auth_disabled: bool = False

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "env_file": ".env",
        "extra": "ignore",
    }

    @property
    def authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}"

    @property
    def issuer_v2(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}/v2.0"

    @property
    def issuer_v1(self) -> str:
        return f"https://sts.windows.net/{self.tenant_id}/"

    @property
    def jwks_uri(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}/discovery/v2.0/keys"


auth_settings = AuthSettings()


# ---------------------------------------------------------------------------
# JWKS key cache
# ---------------------------------------------------------------------------


@dataclass
class _JWKSCache:
    """In-memory cache for Microsoft's JWKS signing keys."""

    keys: dict[str, jwt.algorithms.RSAAlgorithm] = field(default_factory=dict)
    _raw_jwks: dict | None = None

    async def get_key(self, kid: str) -> jwt.algorithms.RSAAlgorithm | None:
        """Return the signing key for the given ``kid``, refreshing if needed."""
        if kid not in self.keys:
            await self._refresh()
        return self.keys.get(kid)

    async def _refresh(self) -> None:
        """Fetch the JWKS document from Microsoft and cache all keys."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(auth_settings.jwks_uri)
                resp.raise_for_status()
                self._raw_jwks = resp.json()

            self.keys.clear()
            for key_data in self._raw_jwks.get("keys", []):
                kid = key_data.get("kid")
                if kid:
                    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
                    self.keys[kid] = public_key
            logger.info("Refreshed JWKS cache: %d keys loaded", len(self.keys))
        except Exception:
            logger.exception("Failed to refresh JWKS from %s", auth_settings.jwks_uri)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to fetch signing keys from identity provider",
            ) from None


_jwks_cache = _JWKSCache()


# ---------------------------------------------------------------------------
# Token model
# ---------------------------------------------------------------------------


@dataclass
class TokenPayload:
    """Parsed and validated token claims."""

    sub: str
    name: str
    email: str
    oid: str
    tid: str
    scopes: list[str]
    roles: list[str]
    raw: dict


# ---------------------------------------------------------------------------
# Core token validation
# ---------------------------------------------------------------------------


async def _validate_token(token: str) -> TokenPayload:
    """Validate and decode a JWT access token from Microsoft Entra ID.

    Raises ``HTTPException(401)`` on any validation failure.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode header without verification to extract kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError:
        raise credentials_exception from None

    kid = unverified_header.get("kid")
    if not kid:
        raise credentials_exception

    # Fetch the signing key
    signing_key = await _jwks_cache.get_key(kid)
    if signing_key is None:
        raise credentials_exception

    # Accept both the Application ID URI and the raw client ID as valid audiences,
    # because Entra v1 tokens use the raw GUID while v2 tokens use the URI.
    valid_audiences = [auth_settings.api_audience]
    raw_client_id = auth_settings.api_audience.removeprefix("api://")
    if raw_client_id != auth_settings.api_audience:
        valid_audiences.append(raw_client_id)

    # Accept both v1 and v2 issuer formats
    valid_issuers = [auth_settings.issuer_v2, auth_settings.issuer_v1]

    # Decode and validate the token
    try:
        payload = jwt.decode(
            token,
            key=signing_key,
            algorithms=["RS256"],
            audience=valid_audiences,
            issuer=valid_issuers,
            options={
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
                "require": ["exp", "iss", "aud", "sub"],
            },
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise credentials_exception from None

    # Validate tenant ID
    token_tid = payload.get("tid", "")
    if token_tid != auth_settings.tenant_id:
        logger.warning(
            "Token tenant %s does not match expected %s",
            token_tid,
            auth_settings.tenant_id,
        )
        raise credentials_exception

    # Extract claims
    return TokenPayload(
        sub=payload.get("sub", ""),
        name=payload.get("name", ""),
        email=payload.get("preferred_username", payload.get("email", "")),
        oid=payload.get("oid", ""),
        tid=token_tid,
        scopes=payload.get("scp", "").split() if payload.get("scp") else [],
        roles=payload.get("roles", []),
        raw=payload,
    )


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


async def require_auth(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
    ] = None,
) -> TokenPayload:
    """FastAPI dependency that requires a valid Entra ID access token.

    When ``AUTH_DISABLED=true``, returns a synthetic payload for local
    development.
    """
    if auth_settings.auth_disabled:
        return TokenPayload(
            sub="dev-user",
            name="Local Developer",
            email="dev@localhost",
            oid="00000000-0000-0000-0000-000000000000",
            tid="dev-tenant",
            scopes=["access_as_user"],
            roles=["Glossary.Admin"],
            raw={},
        )

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return await _validate_token(credentials.credentials)


def require_scope(*required_scopes: str):
    """Return a dependency that checks the token contains ALL required scopes.

    Usage::

        @router.get("/items", dependencies=[Depends(require_scope("access_as_user"))])
        async def list_items(...): ...
    """

    async def _check(
        token: Annotated[TokenPayload, Depends(require_auth)],
    ) -> TokenPayload:
        for scope in required_scopes:
            if scope not in token.scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient scope. Required: {scope}",
                )
        return token

    return _check


def require_role(*required_roles: str):
    """Return a dependency that checks the token contains at least ONE of the
    required roles.

    Usage::

        @router.delete("/items/{id}", dependencies=[Depends(require_role("Glossary.Admin"))])
        async def delete_item(...): ...
    """

    async def _check(
        token: Annotated[TokenPayload, Depends(require_auth)],
    ) -> TokenPayload:
        if not any(role in token.roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient role. Required one of: {', '.join(required_roles)}",
            )
        return token

    return _check
