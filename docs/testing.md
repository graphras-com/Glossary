# Testing

Backend tests (pytest), frontend unit tests (Vitest), and end-to-end tests (Playwright).

---

## Backend Tests (pytest)

### Running

```bash
# Run all tests
uv run pytest

# Verbose output
uv run pytest -v

# Run a specific test file
uv run pytest tests/test_categories.py

# Run a specific test
uv run pytest tests/test_categories.py::test_create_category

# With coverage report
uv run pytest --cov=app --cov=resources
```

The CI coverage threshold is **85%**.

### Configuration

From `pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
pythonpath = ["."]
```

- **`asyncio_mode = "auto"`** -- all test functions are automatically treated as async. No need for `@pytest.mark.asyncio` decorators.
- **`pythonpath = ["."]`** -- allows `import app` and `import resources` without installation.

### Test Fixtures (`tests/conftest.py`)

The test suite provides these fixtures:

#### `engine`

Creates an **in-memory SQLite** async engine for each test. Tables are created before the test and dropped after:

```python
@pytest.fixture()
async def engine():
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    # ... drop all tables and dispose
```

#### `db_session`

Provides an async SQLAlchemy session bound to the in-memory database.

#### `client`

An `httpx.AsyncClient` configured for HTTP-level integration testing:

- Overrides `get_db` to use the in-memory SQLite database
- Overrides `require_auth` to bypass JWT validation, returning a synthetic admin user:

```python
_TEST_USER = TokenPayload(
    sub="test-user-id",
    name="Test User",
    email="test@example.com",
    scopes=["access_as_user"],
    roles=["Glossary.Admin"],
)
```

All tests run as an authenticated admin by default.

#### `seed_categories`

Creates four categories (network, network.mobile, network.access, commercial) via the API and returns their response bodies.

#### `seed_term`

Creates a term "LTE" with two definitions (depends on `seed_categories`) and returns its response body.

### Writing Backend Tests

Test files go in `tests/` following the pattern `test_<resource>.py`. Example:

```python
import pytest
from httpx import AsyncClient


async def test_create_example(client: AsyncClient):
    response = await client.post("/examples/", json={
        "name": "Test Example",
        "description": "A test description",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Example"


async def test_create_duplicate_returns_409(client: AsyncClient):
    await client.post("/examples/", json={"name": "Duplicate"})
    response = await client.post("/examples/", json={"name": "Duplicate"})
    assert response.status_code == 409
```

Key patterns:
- No `@pytest.mark.asyncio` needed (auto mode)
- Use the `client` fixture for HTTP-level tests
- Use `seed_categories` / `seed_term` fixtures for tests that need pre-existing data
- Tests are isolated: each test gets a fresh in-memory database

---

## Frontend Unit Tests (Vitest)

### Running

```bash
cd frontend

# Run all unit tests
npm run test:unit

# Watch mode
npx vitest

# Run a specific test file
npx vitest run src/pdf/generateGlossaryPdf.test.js
```

### Configuration

From `frontend/vite.config.js`:

```js
test: {
  environment: 'node',
  include: ['src/**/*.test.{js,jsx}'],
},
```

- Test environment is `node` (not jsdom)
- Test files are co-located with source: `src/**/*.test.{js,jsx}`

### Writing Unit Tests

Place test files next to the source file they test:

```
src/
  pdf/
    generateGlossaryPdf.js
    generateGlossaryPdf.test.js
  hooks/
    useSomeHook.js
    useSomeHook.test.js
```

Example:

```js
import { describe, it, expect } from "vitest";

describe("myFunction", () => {
  it("should return expected result", () => {
    expect(myFunction("input")).toBe("output");
  });
});
```

---

## End-to-End Tests (Playwright)

### Running

```bash
cd frontend

# Run all E2E tests (headless)
npm test

# Run headed (visible browser)
npm run test:headed

# Run a specific test file
npx playwright test e2e/categories.spec.js

# Debug mode (step through tests)
npx playwright test --debug
```

### Prerequisites

The Playwright configuration auto-starts the Vite dev server. The backend does **not** need to be running -- all API calls are intercepted by route mocking.

Install browsers on first run:

```bash
npx playwright install chromium
```

### Configuration

From `frontend/playwright.config.js`:

```js
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_AUTH_DISABLED: "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

Key details:
- **Single browser:** Chromium only
- **Auth disabled:** `VITE_AUTH_DISABLED=true` is set in the webServer env
- **Dev server reuse:** in local development, Playwright reuses an already-running dev server; in CI, it starts a fresh one
- **Screenshots:** captured only on failure

### API Mocking (`e2e/helpers.js`)

E2E tests do **not** hit the real backend. The `helpers.js` file provides a `mockApi(page)` function that intercepts all API requests using Playwright's `page.route()`:

```js
import { mockApi } from "./helpers.js";

test("should list categories", async ({ page }) => {
  const { categories, terms } = await mockApi(page);
  await page.goto("/categories");
  // ... assertions
});
```

`mockApi` returns mutable references to the mock data arrays (`categories` and `terms`), allowing tests to verify CRUD mutations.

The mock covers all endpoints: categories CRUD, terms CRUD, definitions CRUD, recommend-definition, backup, and restore.

### Test Files

```
frontend/e2e/
  helpers.js              Shared mock data and route-mocking helpers
  home.spec.js            Home page tests
  categories.spec.js      Category CRUD tests
  terms.spec.js           Term CRUD tests
  definitions.spec.js     Definition CRUD tests
  search.spec.js          Search and filter tests
  backup.spec.js          Backup download tests
  restore.spec.js         Restore upload tests
  pdf.spec.js             PDF generation tests
```

### Writing E2E Tests

```js
import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Examples", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("should display the examples list", async ({ page }) => {
    await page.goto("/examples");
    await expect(page.locator("h1")).toContainText("Examples");
  });
});
```

Key patterns:
- Always call `mockApi(page)` before navigating
- The mock intercepts requests matching `localhost:(5173|8000)/(categories|terms|backup|health)` -- update the regex pattern in `helpers.js` if adding new resource paths
- HTML page navigations (with `Accept: text/html`) pass through to the Vite dev server

---

## CI Integration

GitHub Actions runs all test suites on every push and pull request:

| Job           | What it runs                          | Matrix        |
|---------------|---------------------------------------|---------------|
| `py-test`     | `pytest` with coverage                | Python 3.11, 3.12, 3.13 |
| `fe-unit`     | `npm run test:unit` (Vitest)          | Node 22       |
| `fe-e2e`      | `npx playwright test`                 | Node 22 + Python (for backend) |
| `py-lint`     | `ruff check` + `ruff format --check`  | Python 3.12   |
| `fe-lint`     | `npm run lint` (ESLint)               | Node 22       |
| `fe-build`    | `npm run build` (Vite production)     | Node 22       |

All jobs must pass the **quality gate** before Docker images are built or deployments triggered. See [Deployment](deployment.md) for pipeline details.
