# Development

Coding conventions, project organization, and how to extend the application with new entities.

---

## Architecture Overview

The codebase separates a **generic CRUD framework** (`app/`) from **domain-specific code** (`resources/`):

- **`app/`** -- reusable CRUD framework. Auto-generates routers, backup/restore, and seeding from resource declarations. Modify with extreme caution.
- **`resources/`** -- domain-specific models, schemas, config, and custom routers. This is where entity changes go.
- **`frontend/src/config/resources.js`** -- frontend equivalent of `resources/config.py`. Drives auto-generated routes, API client functions, and CRUD pages.

See [Architecture](architecture.md) for full details.

---

## Python Conventions

### General

- **Target:** Python 3.11+ (CI runs on 3.11, 3.12, and 3.13)
- **Union syntax:** use `str | None` (not `Optional[str]`)
- **No print statements:** the `T20` Ruff rule is enforced; use `logging` instead
- **Async throughout:** all database operations use `async`/`await` with SQLAlchemy 2 async sessions

### Linting and Formatting

The project uses [Ruff](https://docs.astral.sh/ruff/) for both linting and formatting:

```bash
# Lint (must pass with zero errors)
uv run ruff check .

# Format check (must pass)
uv run ruff format --check .

# Auto-format
uv run ruff format .
```

**Configuration** (from `pyproject.toml`):

| Setting          | Value                                    |
|------------------|------------------------------------------|
| `target-version` | `py311`                                  |
| `line-length`    | 88                                       |
| Rule sets        | E, W, F, I, N, UP, B, SIM, T20, RUF     |
| Ignored          | `E501` (formatter handles line length), `B008` (FastAPI `Depends()` in defaults), `N803`/`N806` (PascalCase vars in generic factories) |
| First-party      | `app`, `resources`                       |

### Import Organization

Ruff's isort integration is configured with `app` and `resources` as first-party packages. Imports are grouped: stdlib, third-party, first-party.

### Error Handling

- FK reference violations: return **422** with detail message
- Unique field violations: return **409** (`HTTPException`)
- Protected-on-delete violations: return **409** if resource is still referenced
- Use `HTTPException` from FastAPI with appropriate status codes
- Services in `app/services/` are standalone async functions, not classes

### Authentication

All routers require authentication via `Depends(require_auth)`, applied at the router level by the generic CRUD framework. See [Authentication](authentication.md) for details.

---

## Frontend Conventions

### General

- **React 19** with JSX (`.jsx` files, not TypeScript)
- **Vite 8** bundler, **React Router 7** for routing
- **Resource-driven UI:** `frontend/src/config/resources.js` defines entities; generic components render CRUD pages automatically

### Linting

The project uses ESLint with react-hooks and react-refresh plugins:

```bash
cd frontend
npm run lint
```

**Configuration** (from `eslint.config.js`):

- `no-unused-vars` ignores uppercase and underscore-prefixed variables (`varsIgnorePattern: '^[A-Z_]'`)
- Config files (`vite.config.js`, `eslint.config.js`, `playwright.config.js`) use Node.js globals
- The `dist/` directory is globally ignored

### File Organization

```
frontend/src/
  config/resources.js     Resource registry (single source of truth)
  api/client.js           Generic API client (auto-generates CRUD functions)
  components/             Generic CRUD components (CrudList, CrudCreate, CrudEdit, CrudDetail)
  pages/                  Page components (some override generic pages)
  hooks/                  Custom React hooks
  auth/                   MSAL authentication
  pdf/                    Client-side PDF generation
```

### Page Overrides

Custom page components can override the generic CRUD pages. Overrides are registered in `App.jsx` via the `pageOverrides` map:

```js
const pageOverrides = {
  terms: {
    list: TermListPage,
    create: TermCreatePage,
  },
};
```

When a resource has an override, the custom component is rendered instead of the generic one.

### API Client

`frontend/src/api/client.js` auto-generates CRUD functions from the resource config. It also exports named functions for backward compatibility. When adding a new resource, the generic client automatically generates `fetchCategories`, `createCategory`, etc. based on the resource name.

---

## Adding a New Entity

This is the most common development task. Follow these steps in order:

### 1. Backend Model (`resources/models.py`)

Add a SQLAlchemy model inheriting from `app.models.Base`:

```python
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class ExampleModel(Base):
    __tablename__ = "examples"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
```

Key requirements:
- Use SQLAlchemy 2 `Mapped[]` / `mapped_column()` syntax
- All relationships should use `lazy="selectin"` for async compatibility

### 2. Backend Schemas (`resources/schemas.py`)

Add Pydantic v2 schemas:

```python
from pydantic import BaseModel, Field


class ExampleCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: str | None = None


class ExampleRead(BaseModel):
    id: int
    name: str
    description: str | None

    model_config = {"from_attributes": True}


class ExampleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    description: str | None = None
```

Key requirements:
- Read schemas must have `model_config = {"from_attributes": True}`
- Use `str | None` union syntax (not `Optional`)

### 3. Register in Backend Config (`resources/config.py`)

```python
from resources.models import ExampleModel
from resources.schemas import ExampleCreate, ExampleRead, ExampleUpdate

registry.register(
    ResourceConfig(
        name="examples",
        model=ExampleModel,
        create_schema=ExampleCreate,
        read_schema=ExampleRead,
        update_schema=ExampleUpdate,
        pk_field="id",
        pk_type=int,
        order_by="name",
        unique_fields=["name"],
        label="Examples",
        label_singular="Example",
    )
)
```

This single registration auto-generates:
- `GET /examples/` -- list all
- `GET /examples/{id}` -- get one
- `POST /examples/` -- create
- `PATCH /examples/{id}` -- update
- `DELETE /examples/{id}` -- delete

### 4. Re-export for Backward Compatibility

Update `app/models.py`:

```python
from resources.models import ExampleModel  # noqa: F401
```

Update `app/schemas.py`:

```python
from resources.schemas import ExampleCreate, ExampleRead, ExampleUpdate  # noqa: F401
```

### 5. Frontend Config (`frontend/src/config/resources.js`)

Add the resource to the `resources` array:

```js
{
  name: "examples",
  label: "Examples",
  labelSingular: "Example",
  apiPath: "/examples",
  pkField: "id",
  pkType: "number",
  navOrder: 3,
  listDisplay: "table",
  searchable: true,
  fields: [
    {
      name: "name",
      label: "Name",
      type: "text",
      required: true,
      showInList: true,
      showInForm: true,
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      showInList: true,
      showInForm: true,
      nullable: true,
      rows: 3,
    },
  ],
  children: [],
},
```

This auto-generates all frontend CRUD pages, navigation links, and API client functions.

### 6. Vite Dev Server Proxy

Add a proxy rule in `frontend/vite.config.js` so the dev server forwards API calls to the backend:

```js
server: {
  proxy: {
    '/examples': { target: 'http://localhost:8000', bypass: apiOnly },
    // ... existing routes
  },
},
```

### 7. Database Migration

Generate an Alembic migration for PostgreSQL deployments:

```bash
uv run alembic revision --autogenerate -m "add examples table"
```

SQLite deployments use `create_all` on startup and don't need migrations.

### 8. Seed Data (Optional)

If the new entity should ship with seed data, add it to `base_data_import/glossary-seed.json`. The key name must match the resource `name` in the config. Seeding is idempotent -- it only runs if the first resource's table is empty.

### 9. Tests

Add backend tests in `tests/test_examples.py` and frontend E2E tests in `frontend/e2e/examples.spec.js`. See [Testing](testing.md).

---

## Adding Custom Endpoints

For endpoints beyond generic CRUD (e.g. AI recommendations, text extraction):

1. Create a router in `resources/routers/`:

```python
# resources/routers/my_feature.py
from fastapi import APIRouter, Depends
from app.auth import require_auth

router = APIRouter(tags=["my-feature"])

@router.post("/my-feature/do-something", dependencies=[Depends(require_auth)])
async def do_something():
    ...
```

2. Register in `resources/config.py`:

```python
def _load_custom_routers():
    from resources.routers import my_feature
    return [recommend.router, extract_glossary.router, my_feature.router]
```

Custom routers are standard FastAPI `APIRouter` instances. They are loaded lazily to avoid circular imports.

---

## ResourceConfig Reference

Key fields on `ResourceConfig` (defined in `app/crud/registry.py`):

| Field                  | Type                  | Purpose                                                |
|------------------------|-----------------------|--------------------------------------------------------|
| `name`                 | `str`                 | URL prefix and API tag (e.g. `"categories"`)           |
| `model`                | model class           | SQLAlchemy model                                       |
| `create_schema`        | Pydantic class        | Request body for POST                                  |
| `read_schema`          | Pydantic class        | Response body                                          |
| `update_schema`        | Pydantic class        | Request body for PATCH                                 |
| `pk_field`             | `str`                 | Primary key column name                                |
| `pk_type`              | `type`                | `int` or `str`                                         |
| `order_by`             | `str`                 | Default sort column for list endpoint                  |
| `unique_fields`        | `list[str]`           | Fields checked for uniqueness (409 on duplicate)       |
| `searchable_fields`    | `list[str]`           | Fields searched by `?q=` parameter                     |
| `filterable_fks`       | `dict[str, str]`      | Query param filters through relationships              |
| `fk_validations`       | `dict[str, type]`     | FK fields validated before create/update (422)         |
| `protect_on_delete`    | `bool`                | Return 409 instead of cascade on delete if referenced  |
| `children`             | `list[ChildResourceConfig]` | Nested child resources                           |
| `backup_schema`        | Pydantic class        | Schema for backup serialization (falls back to read)   |
| `self_referencing_fk`  | `str`                 | Self-referencing FK for topological backup restore      |

---

## Frontend Resource Config Reference

Key fields in the `resources.js` resource objects:

| Field              | Type       | Purpose                                           |
|--------------------|------------|---------------------------------------------------|
| `name`             | `string`   | Resource identifier (matches backend)              |
| `label`            | `string`   | Plural display name                                |
| `labelSingular`    | `string`   | Singular display name                              |
| `apiPath`          | `string`   | API URL prefix (e.g. `"/categories"`)              |
| `pkField`          | `string`   | Primary key field name                             |
| `pkType`           | `string`   | `"number"` or `"string"`                           |
| `navOrder`         | `number`   | Navigation bar ordering (lower = first)            |
| `listDisplay`      | `string`   | `"table"` or `"detail-cards"`                      |
| `searchable`       | `boolean`  | Enable `?q=` search field                          |
| `filters`          | `array`    | Dropdown filter definitions                        |
| `fields`           | `array`    | Field definitions for forms and lists              |
| `children`         | `array`    | Nested child resource definitions                  |

Field types: `"text"`, `"textarea"`, `"select"`, `"number"`, `"code"`.

Special field options: `source` (resource for select dropdown), `showInList`, `showInForm` (`true`, `"create-only"`, `"edit-only"`), `required`, `nullable`, `render` (`"code"`).

---

## Do-Not-Touch Areas

### Generic Framework (`app/`)

These files form the reusable CRUD framework. Changes affect all resources:

- `app/crud/router_factory.py` -- auto-generates CRUD routers
- `app/crud/nested_router.py` -- auto-generates nested child routers
- `app/crud/backup.py` -- generic backup/restore
- `app/crud/seed.py` -- generic seeding
- `app/crud/registry.py` -- ResourceConfig/ChildResourceConfig dataclasses
- `app/main.py` -- app factory, auto-registration loop
- `app/auth.py` -- JWT validation (security-sensitive)
- `app/database.py` -- engine configuration
- `frontend/src/api/client.js` -- generic API client
- `frontend/src/components/Crud*.jsx` -- generic CRUD components
- `frontend/src/App.jsx` -- generic route generation

### Immutable Files

- `alembic/versions/` -- existing migration files must never be modified; only add new ones
- `uv.lock` -- regenerated by `uv sync`; do not edit manually
- `frontend/package-lock.json` -- regenerated by `npm install`; do not edit manually

---

## Validation Checklist

All of the following must pass before a change is considered valid:

```bash
uv run ruff check .                    # Zero lint errors
uv run ruff format --check .           # Zero formatting issues
uv run pytest                          # All backend tests pass
cd frontend && npm run lint            # Zero ESLint errors
cd frontend && npm run test:unit       # All Vitest unit tests pass
cd frontend && npm run build           # Production build succeeds
```

See [Testing](testing.md) for detailed test instructions.
