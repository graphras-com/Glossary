# Configuration

All configuration is done via environment variables. The backend reads from `.env` at the project root. The frontend uses Vite's `VITE_` prefix convention and reads from `frontend/.env` (or is baked in at Docker build time via `--build-arg`).

## Backend Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | *(none)* | Full database connection string. Accepts `postgresql://`, `postgres://`, or `postgresql+asyncpg://` formats. Takes priority over `DATABASE_PATH`. |
| `DATABASE_PATH` | No | `./dictionary.db` (local), `/data/dictionary.db` (Docker) | Path to SQLite database file. Used as fallback when `DATABASE_URL` is not set. |
| `AUTH_DISABLED` | No | `false` | Set `true` to skip JWT validation. When enabled, a synthetic admin user (`Glossary.Admin` role) is injected for all requests. **Local development only.** |
| `TENANT_ID` | Yes* | *(none)* | Microsoft Entra tenant ID (GUID). |
| `API_AUDIENCE` | Yes* | *(none)* | Application ID URI of the API app registration (e.g. `api://aaaaaaaa-...`). |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173,http://localhost:8000` | Comma-separated list of allowed CORS origins. |
| `OPENAI_API_KEY` | No | *(none)* | OpenAI API key for AI definition recommendations. If not set, the recommend endpoint returns a 503 error. |
| `OPENAI_RECOMMENDATION_MODEL` | No | `gpt-4.1-mini` | Model name passed to the OpenAI API. |
| `OPENAI_API_URL` | No | `https://api.openai.com/v1/chat/completions` | OpenAI-compatible chat completions endpoint. Override to use Azure OpenAI or other compatible providers. |

\* Required when `AUTH_DISABLED=false`.

### Database URL Handling

The `DATABASE_URL` variable supports automatic async driver rewriting:

- `postgres://...` is rewritten to `postgresql+asyncpg://...`
- `postgresql://...` is rewritten to `postgresql+asyncpg://...`
- `postgresql+asyncpg://...` is used as-is
- If `DATABASE_URL` is empty, falls back to SQLite at `DATABASE_PATH`

## Frontend Environment Variables

Set these in `frontend/.env` for local development, or pass as Docker build arguments for production builds.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_CLIENT_ID` | Yes* | *(none)* | SPA app registration client ID from Entra. |
| `VITE_TENANT_ID` | Yes* | *(none)* | Entra tenant ID (GUID). |
| `VITE_API_SCOPE` | Yes* | *(none)* | Full API scope URI (e.g. `api://aaaaaaaa-.../access_as_user`). |
| `VITE_AUTHORITY` | No | `https://login.microsoftonline.com/{VITE_TENANT_ID}` | Override the MSAL authority URL. |
| `VITE_API_URL` | No | *(empty string)* | API base URL. Empty means same origin (works with Vite proxy in dev, and the static file mount in Docker). |
| `VITE_AUTH_DISABLED` | No | *(none)* | Set `true` to bypass MSAL entirely. Used for E2E tests and local development. |

\* Required when auth is enabled (i.e., `VITE_AUTH_DISABLED` is not `true`).

### Build-Time Variables

These are injected via Vite's `define` config and available in frontend code as global constants:

| Variable | Source | Description |
|---|---|---|
| `VITE_BUILD_COMMIT` | CI/CD | Git commit SHA |
| `VITE_BUILD_TAG` | CI/CD | Git tag (e.g. `v1.0.0`) |
| `VITE_BUILD_BRANCH` | CI/CD | Git branch name |
| `VITE_BUILD_TIME` | CI/CD | Build timestamp |

These are exposed as `__BUILD_COMMIT__`, `__BUILD_TAG__`, `__BUILD_BRANCH__`, and `__BUILD_TIME__` in the frontend JavaScript and used by the `VersionBar` component.

## Example `.env` File

```env
# ── OpenAI (for AI-powered definition recommendations) ──
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_RECOMMENDATION_MODEL=gpt-4.1-mini

# ── Microsoft Entra ID Authentication ──
AUTH_DISABLED=true
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
API_AUDIENCE=api://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# ── CORS ──
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# ── Database ──
# For PostgreSQL: DATABASE_URL=postgresql://user:password@host:5432/glossary
DATABASE_PATH=./dictionary.db
```
