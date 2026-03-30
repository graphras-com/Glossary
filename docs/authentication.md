# Authentication

Microsoft Entra ID (Azure AD) authentication using OIDC and OAuth 2.0 Authorization Code Flow with PKCE.

| Aspect   | Detail                                                    |
|----------|-----------------------------------------------------------|
| Protocol | OIDC + OAuth 2.0 Authorization Code Flow with PKCE       |
| Frontend | React SPA with MSAL.js v2 (popup-based)                  |
| Backend  | FastAPI with PyJWT (RS256 signature verification)         |
| Tenancy  | Single-tenant (company employees only)                    |
| Bypass   | `AUTH_DISABLED=true` / `VITE_AUTH_DISABLED=true` for dev  |

---

## Entra ID Configuration

Two app registrations are required in Microsoft Entra ID: one for the API and one for the SPA.

### API App Registration

1. Go to **Azure Portal > Microsoft Entra ID > App registrations > New registration**.
2. Configure:
   - **Name:** `Glossary API`
   - **Supported account types:** `Accounts in this organizational directory only`
   - **Redirect URI:** leave blank
3. Click **Register**.
4. Note the **Application (client) ID** and **Directory (tenant) ID**.

#### Expose an API

1. Go to **Expose an API** and set the Application ID URI (accept the default `api://<client-id>`). This becomes your `API_AUDIENCE`.
2. Add a scope:
   - **Scope name:** `access_as_user`
   - **Who can consent:** Admins and users
   - **State:** Enabled
3. The full scope URI `api://<client-id>/access_as_user` becomes your `VITE_API_SCOPE`.

#### Define App Roles (RBAC)

Create these roles under **App roles**:

| Display Name     | Value             | Description                                |
|------------------|-------------------|--------------------------------------------|
| Glossary Admin   | `Glossary.Admin`  | Full access including backup/restore       |
| Glossary Editor  | `Glossary.Editor` | Create, edit, delete terms and categories  |
| Glossary Reader  | `Glossary.Reader` | Read-only access                           |

Assign roles to users/groups via **Enterprise Applications > Glossary API > Users and groups**.

### SPA App Registration

1. Go to **App registrations > New registration**.
2. Configure:
   - **Name:** `Glossary SPA`
   - **Supported account types:** `Accounts in this organizational directory only`
   - **Redirect URI:** Platform = `Single-page application (SPA)`, URI = `http://localhost:5173`
3. Click **Register**.
4. Note the **Application (client) ID** -- this is your `VITE_CLIENT_ID`.

#### Redirect URIs

Add all environments under **Authentication > Single-page application**:

- `http://localhost:5173` (Vite dev server)
- `http://localhost:8000` (Docker local)
- `https://your-production-domain.com`
- `https://your-staging-domain.com`

#### API Permission

1. Go to **API permissions > Add a permission > My APIs > Glossary API**.
2. Select **Delegated permissions**, check `access_as_user`.
3. Click **Grant admin consent for [Your Org]**.

### Summary of IDs

| Value        | Example                                                  | Used As                    |
|--------------|----------------------------------------------------------|----------------------------|
| Tenant ID    | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`                   | `TENANT_ID`, `VITE_TENANT_ID` |
| API Audience | `api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`             | `API_AUDIENCE`             |
| API Scope    | `api://aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/access_as_user` | `VITE_API_SCOPE`        |
| SPA Client ID | `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`                  | `VITE_CLIENT_ID`           |

---

## Frontend Authentication

### Architecture

- **MSAL.js v2** with popup-based login (redirect flow is incompatible with `memoryStorage`)
- **Authorization Code Flow with PKCE** -- implicit flow is not used
- **Tokens stored in memory only** -- never in `localStorage` or `sessionStorage`
- **Automatic silent token refresh** -- MSAL handles renewal
- **401 handling** -- the API client automatically triggers re-login on 401 responses

### File Structure

```
frontend/src/auth/
  msalConfig.js       MSAL configuration (client ID, tenant, scopes)
  msalInstance.js      Singleton MSAL PublicClientApplication instance
  AuthProvider.jsx     MsalProvider wrapper with initialization state
  RequireAuth.jsx      Route guard -- shows Login page if unauthenticated
  roles.js             RBAC role constants (ROLE_ADMIN, ROLE_EDITOR, ROLE_READER)
```

### Auth Bypass

Set `VITE_AUTH_DISABLED=true` to skip MSAL entirely. When disabled:

- `AuthProvider` renders children directly without `MsalProvider`
- `RequireAuth` passes through without checking authentication state
- The API client sends requests without an `Authorization` header

### Token Flow

1. `AuthProvider` initializes MSAL and handles any pending redirect.
2. `RequireAuth` checks if the user is authenticated.
3. If not authenticated, renders `Login` page with a "Sign in with Microsoft" button.
4. User clicks sign in -- MSAL opens a popup to the Microsoft login page.
5. Microsoft authenticates and returns an auth code.
6. MSAL exchanges the auth code for tokens (PKCE-verified).
7. Tokens are stored in memory.
8. For each API request, the client acquires a token silently and sends it as `Authorization: Bearer <token>`.

### RBAC in Frontend

`roles.js` exports helper functions for checking user roles from MSAL account claims:

```js
import { hasRole, isAdmin, ROLE_ADMIN, ROLE_EDITOR } from "./auth/roles";

// Check specific role
hasRole(account, ROLE_ADMIN, ROLE_EDITOR); // true if user has either role

// Shorthand for admin check
isAdmin(account); // true if user has Glossary.Admin
```

Roles are read from `account.idTokenClaims.roles` (an array of role value strings assigned in Entra ID).

### Vite Build Configuration

The MSAL popup redirect target is built as a separate entry point:

```js
// vite.config.js
build: {
  rollupOptions: {
    input: {
      main: resolve(__dirname, 'index.html'),
      'auth-popup': resolve(__dirname, 'auth-popup.html'),
    },
  },
},
```

---

## Backend Authentication

### Architecture

- **JWT validation** using PyJWT with RS256 cryptographic signature verification
- **JWKS fetching** from Microsoft's `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`, cached in memory and refreshed on unknown `kid`
- **Claim validation:** `iss`, `aud`, `exp`, `nbf`, `tid`, `sub`
- **Dual issuer support:** accepts both v1 (`https://sts.windows.net/{tenant}/`) and v2 (`https://login.microsoftonline.com/{tenant}/v2.0`) issuers
- **Dual audience support:** accepts both the Application ID URI (`api://client-id`) and the raw client GUID
- **Tenant ID validation:** token `tid` claim must match the configured `TENANT_ID`
- All routers require `Depends(require_auth)` -- applied at the router level by the generic CRUD framework
- The `/health` endpoint is unauthenticated (for Kubernetes probes)

### Auth Bypass

Set `AUTH_DISABLED=true` to skip JWT validation. When disabled, `require_auth` returns a synthetic `TokenPayload`:

```python
TokenPayload(
    sub="dev-user",
    name="Local Developer",
    email="dev@localhost",
    scopes=["access_as_user"],
    roles=["Glossary.Admin"],
)
```

This gives the dev user full admin access to all endpoints.

### Token Payload

The `TokenPayload` dataclass (defined in `app/auth.py`) contains:

| Field    | Type         | Source                                      |
|----------|-------------|---------------------------------------------|
| `sub`    | `str`       | `sub` claim (user identifier)               |
| `name`   | `str`       | `name` claim                                |
| `email`  | `str`       | `preferred_username` or `email` claim        |
| `oid`    | `str`       | `oid` claim (object ID)                      |
| `tid`    | `str`       | `tid` claim (tenant ID)                      |
| `scopes` | `list[str]` | `scp` claim (space-delimited, split to list) |
| `roles`  | `list[str]` | `roles` claim (app roles array)              |
| `raw`    | `dict`      | Full decoded token payload                   |

### Protected Endpoints

All CRUD endpoints require a valid token. Additional role-based protection:

| Endpoint              | Role Required      |
|-----------------------|--------------------|
| `POST /backup/restore`| `Glossary.Admin`   |

All other endpoints require authentication but no specific role.

### Adding Role-Based Protection

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

`require_role` checks that the token contains **at least one** of the specified roles. `require_scope` checks that the token contains **all** specified scopes.

---

## Local Development

### Option A: Auth Disabled (recommended for development)

1. Set `AUTH_DISABLED=true` in `.env` (backend) -- this is the default in `.env.example`.
2. The frontend dev server (`npm run dev`) does not set `VITE_AUTH_DISABLED` by default. If you do not have a `frontend/.env` with `VITE_CLIENT_ID` etc., MSAL initialization will fail. Either:
   - Set `VITE_AUTH_DISABLED=true` in `frontend/.env`, or
   - Provide valid Entra IDs in `frontend/.env`.
3. Start backend and frontend normally. All endpoints work without tokens.

### Option B: Auth Enabled (full flow)

1. Complete the Entra ID Configuration above.
2. Backend `.env`:
   ```
   AUTH_DISABLED=false
   TENANT_ID=your-tenant-id
   API_AUDIENCE=api://your-api-client-id
   CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
   ```
3. Frontend `frontend/.env`:
   ```
   VITE_CLIENT_ID=your-spa-client-id
   VITE_TENANT_ID=your-tenant-id
   VITE_API_SCOPE=api://your-api-client-id/access_as_user
   ```
4. Ensure `http://localhost:5173` is a registered redirect URI in the SPA app registration.
5. Navigate to `http://localhost:5173` and sign in.

### Docker Compose

```bash
# Auth disabled (default via .env)
docker compose up --build

# Auth enabled -- set env vars before building
AUTH_DISABLED=false TENANT_ID=xxx API_AUDIENCE=api://xxx \
  docker compose up --build
```

Note: the Vite env vars (`VITE_CLIENT_ID`, etc.) are baked into the frontend at Docker build time. They are set in `docker-compose.yml` build args, not runtime env vars.

---

## Kubernetes Deployment

Auth environment variables are supplied via a ConfigMap generated inline by the Woodpecker CD pipelines:

```yaml
data:
  AUTH_DISABLED: "false"
  TENANT_ID: "<tenant-id>"
  API_AUDIENCE: "api://<api-client-id>"
  CORS_ALLOWED_ORIGINS: "https://<host>"
```

Frontend auth env vars are baked into the Docker image at build time via `--build-arg` in the GitHub Actions `build-and-push` workflow.

See [Deployment](deployment.md) for full pipeline details.

---

## Troubleshooting

### `AADSTS700054: response_type 'id_token' is not enabled`

**Cause:** Implicit grant is not enabled (this is correct -- PKCE is used instead).
**Fix:** Ensure the redirect URI is registered as **SPA** type, not Web. SPA type enables PKCE automatically.

### `AADSTS65001: The user or administrator has not consented`

**Cause:** Admin consent not granted for the API permission.
**Fix:** Go to SPA app > API permissions > click "Grant admin consent for [org]".

### `AADSTS50011: The redirect URI does not match`

**Cause:** The app's redirect URI doesn't match what MSAL sends.
**Fix:** Add the exact origin (e.g. `http://localhost:5173`) to the SPA app's redirect URIs. The actual redirect target is `{origin}/auth-popup.html` but Entra only checks the origin.

### `401 Invalid or expired token` from FastAPI

Check:
1. `TENANT_ID` matches between frontend and backend.
2. `API_AUDIENCE` matches the Application ID URI exactly.
3. Token hasn't expired (check `exp` claim).
4. Clock skew between server and Microsoft.

### `403 Insufficient role`

**Cause:** User doesn't have the required app role.
**Fix:** Assign the role via **Enterprise Applications > Users and groups** in Azure Portal.

### CORS error in browser console

**Cause:** Backend CORS doesn't allow the frontend origin.
**Fix:** Add the frontend URL to `CORS_ALLOWED_ORIGINS` env var.

### `Token acquisition failed` / silent token error

**Cause:** MSAL couldn't refresh the token silently.
**Fix:** The client automatically triggers re-login. If persistent, check that the SPA app registration is correctly configured.

### Frontend shows "Initialising authentication..." forever

**Cause:** MSAL initialization failed.
**Fix:** Check browser console for errors. Usually `VITE_CLIENT_ID` or `VITE_TENANT_ID` is wrong or empty.

### Tests fail with `401` after adding auth

**Cause:** Test client doesn't have auth override.
**Fix:** The test `conftest.py` fixture overrides `require_auth` with a synthetic admin user. Ensure `app.dependency_overrides[require_auth]` is set in your test fixture. See [Testing](testing.md) for details.

---

**See also:** [Configuration](configuration.md) for the complete environment variable reference.
