# Authentication Setup Guide

Microsoft Entra ID (Azure AD) authentication for the Telecom Glossary application.

**Architecture:** OIDC + OAuth 2.0 Authorization Code Flow with PKCE  
**Frontend:** React SPA with MSAL  
**Backend:** FastAPI with JWT validation  
**Tenant:** Single-tenant (company employees only)

---

## Table of Contents

1. [Entra ID Configuration](#1-entra-id-configuration)
2. [Frontend Configuration](#2-frontend-configuration)
3. [Backend Configuration](#3-backend-configuration)
4. [Kubernetes Deployment](#4-kubernetes-deployment)
5. [Local Development](#5-local-development)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Common Errors and Fixes](#7-common-errors-and-fixes)

---

## 1. Entra ID Configuration

You need **two app registrations** in Microsoft Entra ID: one for the API (FastAPI) and one for the SPA (React).

### 1.1 Create the API App Registration

1. Go to **Azure Portal > Microsoft Entra ID > App registrations > New registration**
2. Configure:
   - **Name:** `Glossary API`
   - **Supported account types:** `Accounts in this organizational directory only` (single tenant)
   - **Redirect URI:** leave blank (APIs don't need redirect URIs)
3. Click **Register**
4. Note the **Application (client) ID** — this is your `API_CLIENT_ID`
5. Note the **Directory (tenant) ID** — this is your `TENANT_ID`

#### Expose an API

1. Go to **Expose an API**
2. Click **Set** next to "Application ID URI"
   - Accept the default: `api://<API_CLIENT_ID>`
   - This becomes your `API_AUDIENCE`
3. Click **Add a scope**:
   - **Scope name:** `access_as_user`
   - **Who can consent:** `Admins and users`
   - **Admin consent display name:** `Access Glossary API as user`
   - **Admin consent description:** `Allows the app to access the Glossary API on behalf of the signed-in user`
   - **State:** `Enabled`
4. Note the full scope value: `api://<API_CLIENT_ID>/access_as_user` — this is your `VITE_API_SCOPE`

#### Define App Roles (RBAC)

1. Go to **App roles > Create app role**
2. Create these roles:

| Display Name | Value | Allowed Member Types | Description |
|---|---|---|---|
| Glossary Admin | `Glossary.Admin` | Users/Groups | Full access including backup/restore |
| Glossary Editor | `Glossary.Editor` | Users/Groups | Create, edit, delete terms and categories |
| Glossary Reader | `Glossary.Reader` | Users/Groups | Read-only access |

3. Assign roles to users/groups via **Enterprise Applications > Glossary API > Users and groups**

### 1.2 Create the SPA App Registration

1. Go to **App registrations > New registration**
2. Configure:
   - **Name:** `Glossary SPA`
   - **Supported account types:** `Accounts in this organizational directory only`
   - **Redirect URI:**
     - Platform: `Single-page application (SPA)`
     - URI: `http://localhost:5173` (for local dev)
3. Click **Register**
4. Note the **Application (client) ID** — this is your `VITE_CLIENT_ID`

#### Add Additional Redirect URIs

1. Go to **Authentication**
2. Under "Single-page application" redirect URIs, add:
   - `http://localhost:5173` (Vite dev server)
   - `http://localhost:8000` (Docker local)
   - `https://your-production-domain.com` (production)
   - `https://your-staging-domain.com` (staging)

#### Add API Permission

1. Go to **API permissions > Add a permission**
2. Select **My APIs > Glossary API**
3. Select **Delegated permissions**
4. Check `access_as_user`
5. Click **Add permissions**
6. Click **Grant admin consent for [Your Org]**

### 1.3 Summary of IDs

After setup, you should have:

| Value | Example | Used As |
|---|---|---|
| Tenant ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | `TENANT_ID`, `VITE_TENANT_ID` |
| API Client ID | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | Part of `API_AUDIENCE` |
| API Audience | `api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` | `API_AUDIENCE` |
| API Scope | `api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/access_as_user` | `VITE_API_SCOPE` |
| SPA Client ID | `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb` | `VITE_CLIENT_ID` |
| Authority | `https://login.microsoftonline.com/{tenant-id}` | `VITE_AUTHORITY` |

---

## 2. Frontend Configuration

### Architecture

- **MSAL.js v2** handles all authentication flows
- **Authorization Code Flow with PKCE** — implicit flow is NOT used
- **Tokens stored in memory only** — never in localStorage or sessionStorage
- **Automatic token refresh** — MSAL handles silent token renewal
- **401 handling** — API client automatically triggers re-login on 401 responses

### File Structure

```
frontend/src/
├── auth/
│   ├── msalConfig.js      # MSAL configuration (client ID, tenant, scopes)
│   ├── AuthProvider.jsx    # MsalProvider wrapper with initialization
│   ├── RequireAuth.jsx     # Route guard for authenticated-only pages
│   └── roles.js            # RBAC role constants and helpers
├── api/
│   └── client.js           # Fetch wrapper with automatic Bearer token injection
├── pages/
│   └── Login.jsx           # Sign-in page for unauthenticated users
└── ...
```

### Environment Variables

Set these in a `.env` file in the `frontend/` directory (Vite requires the `VITE_` prefix):

```env
VITE_CLIENT_ID=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
VITE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_API_SCOPE=api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/access_as_user
```

For Docker builds, pass these as build arguments:

```bash
docker build \
  --build-arg VITE_CLIENT_ID=... \
  --build-arg VITE_TENANT_ID=... \
  --build-arg VITE_API_SCOPE=... \
  .
```

### How Token Flow Works

1. User navigates to the app
2. `AuthProvider` initializes MSAL and handles any pending redirect
3. `RequireAuth` checks if user is authenticated
4. If not authenticated: renders `Login` page with "Sign in with Microsoft" button
5. User clicks sign in -> MSAL redirects to Microsoft login page
6. Microsoft authenticates user and redirects back with auth code
7. MSAL exchanges auth code for tokens (PKCE verified)
8. Tokens stored in memory (not localStorage)
9. API client acquires token silently for each request
10. Token sent as `Authorization: Bearer <token>` header

---

## 3. Backend Configuration

### Architecture

- **JWT validation** using `PyJWT` with cryptographic signature verification
- **JWKS fetching** from Microsoft's discovery endpoint (cached in memory)
- **Claim validation:** `iss`, `aud`, `exp`, `nbf`, `tid`, `sub`
- **Dependency injection** — `require_auth` is a FastAPI dependency applied at the router level
- **RBAC** — `require_role()` and `require_scope()` for fine-grained access control
- **Health endpoint** (`/health`) remains unauthenticated for Kubernetes probes

### Environment Variables

```env
# Set to "true" to skip all token validation (local dev without Entra)
AUTH_DISABLED=false

# Your Entra tenant ID
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Application ID URI of the API app registration
API_AUDIENCE=api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa

# Comma-separated list of allowed CORS origins
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
```

### Protected Endpoints

| Endpoint | Auth Required | Role Required |
|---|---|---|
| `GET /health` | No | — |
| `GET /categories/` | Yes | — |
| `POST /categories/` | Yes | — |
| `PATCH /categories/{id}` | Yes | — |
| `DELETE /categories/{id}` | Yes | — |
| `GET /terms/` | Yes | — |
| `POST /terms/` | Yes | — |
| `PATCH /terms/{id}` | Yes | — |
| `DELETE /terms/{id}` | Yes | — |
| `POST /terms/recommend-definition` | Yes | — |
| `POST /terms/{id}/definitions` | Yes | — |
| `PATCH /terms/{id}/definitions/{def_id}` | Yes | — |
| `DELETE /terms/{id}/definitions/{def_id}` | Yes | — |
| `GET /backup/` | Yes | — |
| `POST /backup/restore` | Yes | `Glossary.Admin` |

### How to Add Role-Based Protection

To protect an endpoint with a specific role:

```python
from app.auth import require_role

@router.delete(
    "/{item_id}",
    dependencies=[Depends(require_role("Glossary.Admin"))],
)
async def delete_item(item_id: int):
    ...
```

To require specific scopes:

```python
from app.auth import require_scope

@router.get(
    "/sensitive",
    dependencies=[Depends(require_scope("access_as_user"))],
)
async def get_sensitive():
    ...
```

---

## 4. Kubernetes Deployment

### ConfigMap

Auth environment variables are supplied via a ConfigMap (`k8s/{env}/configmap.yaml`):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: __APP_NAME__-config
data:
  AUTH_DISABLED: "false"
  TENANT_ID: "__TENANT_ID__"
  API_AUDIENCE: "__API_AUDIENCE__"
  CORS_ALLOWED_ORIGINS: "https://__HOST__"
```

The deployment references this ConfigMap via `envFrom`.

### Build Args for Frontend

When building the Docker image for production, pass the Vite env vars as build args:

```bash
docker build \
  --build-arg VITE_CLIENT_ID=$SPA_CLIENT_ID \
  --build-arg VITE_TENANT_ID=$TENANT_ID \
  --build-arg VITE_API_SCOPE=$API_SCOPE \
  -t ghcr.io/your-org/glossary:latest .
```

---

## 5. Local Development

### Option A: Auth Disabled (quickest)

For local development without Entra:

1. Set `AUTH_DISABLED=true` in `.env`
2. Start the backend: `uv run uvicorn app.main:app --reload`
3. Start the frontend: `cd frontend && npm run dev`
4. All endpoints work without tokens. A synthetic admin user is injected.

### Option B: Auth Enabled (full flow)

1. Complete the [Entra ID Configuration](#1-entra-id-configuration)
2. Set environment variables in `.env`:
   ```
   AUTH_DISABLED=false
   TENANT_ID=your-tenant-id
   API_AUDIENCE=api://your-api-client-id
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
   ```
3. Create `frontend/.env`:
   ```
   VITE_CLIENT_ID=your-spa-client-id
   VITE_TENANT_ID=your-tenant-id
   VITE_API_SCOPE=api://your-api-client-id/access_as_user
   ```
4. Ensure `http://localhost:5173` is a registered redirect URI in the SPA app registration
5. Start backend and frontend as above
6. Navigate to `http://localhost:5173` — you'll see the login page
7. Click "Sign in with Microsoft" and authenticate

### Docker Compose

```bash
# Auth disabled (default)
docker compose up --build

# Auth enabled
AUTH_DISABLED=false \
TENANT_ID=xxx \
API_AUDIENCE=api://xxx \
CORS_ALLOWED_ORIGINS=http://localhost:8000 \
docker compose up --build
```

### Running Tests

```bash
# Backend (auth is bypassed in tests)
uv run python -m pytest tests/ -v

# Frontend unit tests
cd frontend && npx vitest run

# Frontend E2E tests (requires running dev server)
cd frontend && npx playwright test
```

---

## 6. Environment Variables Reference

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_DISABLED` | No | `false` | Set `true` to skip token validation |
| `TENANT_ID` | Yes* | — | Entra tenant ID |
| `API_AUDIENCE` | Yes* | — | Application ID URI (e.g. `api://client-id`) |
| `CORS_ALLOWED_ORIGINS` | No | `localhost:5173,8000` | Comma-separated allowed origins |
| `DATABASE_PATH` | No | `./dictionary.db` | SQLite database file path |

*Required when `AUTH_DISABLED=false`

### Frontend (Vite)

| Variable | Required | Description |
|---|---|---|
| `VITE_CLIENT_ID` | Yes | SPA app registration client ID |
| `VITE_TENANT_ID` | Yes | Entra tenant ID |
| `VITE_API_SCOPE` | Yes | Full API scope URI |
| `VITE_AUTHORITY` | No | Override authority URL |
| `VITE_API_URL` | No | API base URL (empty = same origin) |

---

## 7. Common Errors and Fixes

### `AADSTS700054: response_type 'id_token' is not enabled`

**Cause:** Implicit grant is not enabled (correct — we don't use implicit).  
**Fix:** Ensure redirect URI is registered as **SPA** type (not Web). SPA type enables PKCE.

### `AADSTS65001: The user or administrator has not consented`

**Cause:** Admin consent not granted for the API permission.  
**Fix:** Go to SPA app > API permissions > click "Grant admin consent for [org]".

### `AADSTS50011: The redirect URI does not match`

**Cause:** The app's redirect URI doesn't match what MSAL sends.  
**Fix:** Add `http://localhost:5173` (exactly) to the SPA app's redirect URIs.

### `401 Invalid or expired token` from FastAPI

**Cause:** Token validation failed.  
**Fix:** Check:
1. `TENANT_ID` matches between frontend and backend
2. `API_AUDIENCE` matches the Application ID URI exactly
3. Token hasn't expired (check `exp` claim)
4. Clock skew between server and Microsoft

### `403 Insufficient role`

**Cause:** User doesn't have the required app role.  
**Fix:** Assign the role via Enterprise Applications > Users and groups in Azure Portal.

### `CORS error` in browser console

**Cause:** Backend CORS doesn't allow the frontend origin.  
**Fix:** Add the frontend URL to `CORS_ALLOWED_ORIGINS` env var.

### `Token acquisition failed` / silent token error

**Cause:** MSAL couldn't refresh the token silently.  
**Fix:** This typically means the user needs to re-authenticate. The client automatically redirects to login.

### Frontend shows "Initialising authentication..." forever

**Cause:** MSAL initialization or redirect promise failed.  
**Fix:** Check browser console for errors. Usually means `VITE_CLIENT_ID` or `VITE_TENANT_ID` is wrong/empty.

### Tests fail with `401` after adding auth

**Cause:** Test client doesn't have auth override.  
**Fix:** The `conftest.py` fixture overrides `require_auth` with a mock user. Ensure `app.dependency_overrides[require_auth]` is set in your test fixture.
