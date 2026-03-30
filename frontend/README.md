# Glossary Frontend

React 19 SPA for the Telecom Glossary application. Uses a resource-driven architecture where CRUD pages are auto-generated from configuration.

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` and proxies API requests to `http://localhost:8000`.

## Commands

| Command              | Purpose                         |
|----------------------|---------------------------------|
| `npm run dev`        | Start Vite dev server           |
| `npm run build`      | Production build                |
| `npm run lint`       | ESLint check                    |
| `npm run test:unit`  | Vitest unit tests               |
| `npm test`           | Playwright E2E tests (headless) |
| `npm run test:headed`| Playwright E2E tests (visible)  |

## Documentation

See the project-level docs for full details:

- [Setup](../docs/setup.md) -- local development instructions
- [Development](../docs/development.md) -- coding conventions, frontend resource config
- [Testing](../docs/testing.md) -- Vitest and Playwright details
- [Authentication](../docs/authentication.md) -- MSAL configuration
