# API Reference

All endpoints except `/health` require authentication when `AUTH_DISABLED=false`. See [Authentication](authentication.md) for details.

The API is auto-generated from the resource registry. The FastAPI application also serves interactive API documentation at `/docs` (Swagger UI) and `/redoc` (ReDoc) when running.

## Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Unauthenticated health check. Returns `{"status": "ok"}`. Used by Kubernetes probes. |

## Categories

Categories use a string primary key with dot-notation (e.g., `network.mobile`). The `parent_id` field creates a self-referencing hierarchy.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/categories/` | List all categories, ordered by ID. |
| `GET` | `/categories/{id}` | Get a single category by ID. |
| `POST` | `/categories/` | Create a category. Returns 409 if the ID already exists. Returns 422 if `parent_id` references a non-existent category. |
| `PATCH` | `/categories/{id}` | Update a category's `label` or `parent_id`. Returns 422 if new `parent_id` does not exist. |
| `DELETE` | `/categories/{id}` | Delete a category. Returns 409 if the category is still referenced by definitions. |

### Category Schema

**Create (`POST`):**
```json
{
  "id": "network.mobile",
  "parent_id": "network",
  "label": "Mobile"
}
```

**Response:**
```json
{
  "id": "network.mobile",
  "parent_id": "network",
  "label": "Mobile"
}
```

## Terms

Terms use an auto-increment integer primary key. The `term` field must be unique.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/terms/` | List all terms, ordered by `term` name. Supports `?q=` for case-insensitive search and `?category=` for filtering by definition category. |
| `GET` | `/terms/{id}` | Get a term with its definitions. |
| `POST` | `/terms/` | Create a term with one or more definitions. Returns 409 if the term name already exists. Returns 422 if any definition's `category_id` does not exist. |
| `PATCH` | `/terms/{id}` | Update a term's name. Returns 409 if the new name already exists. |
| `DELETE` | `/terms/{id}` | Delete a term and all its definitions (cascade). |

### Term Schema

**Create (`POST`):**
```json
{
  "term": "LTE",
  "definitions": [
    {
      "en": "Long Term Evolution",
      "da": "Long Term Evolution (dansk)",
      "category_id": "network.mobile"
    }
  ]
}
```

**Response:**
```json
{
  "id": 1,
  "term": "LTE",
  "definitions": [
    {
      "id": 1,
      "en": "Long Term Evolution",
      "da": "Long Term Evolution (dansk)",
      "category_id": "network.mobile"
    }
  ]
}
```

## Definitions (Nested Under Terms)

Definitions are managed as nested resources under terms.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/terms/{term_id}/definitions` | Add a definition to a term. Returns 422 if `category_id` does not exist. |
| `PATCH` | `/terms/{term_id}/definitions/{def_id}` | Update a definition. |
| `DELETE` | `/terms/{term_id}/definitions/{def_id}` | Delete a definition. |

### Definition Schema

**Create (`POST`):**
```json
{
  "en": "A 4G radio access technology",
  "da": null,
  "category_id": "network"
}
```

## Backup and Restore

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/backup/` | Authenticated | Export all categories and terms (with inline definitions) as JSON. |
| `POST` | `/backup/restore` | `Glossary.Admin` role | Replace all data from a JSON upload. Deletes all existing data first. |

### Backup Format

```json
{
  "version": 1,
  "categories": [
    { "id": "network", "parent_id": null, "label": "Network" },
    { "id": "network.mobile", "parent_id": "network", "label": "Mobile" }
  ],
  "terms": [
    {
      "term": "LTE",
      "definitions": [
        { "en": "Long Term Evolution", "da": "...", "category_id": "network.mobile" }
      ]
    }
  ]
}
```

The restore endpoint handles self-referencing FK ordering (categories with `parent_id` are inserted topologically) and parent-child inline embedding (term definitions are extracted and linked after the parent term is created).

## Custom Endpoints

### AI Definition Recommendation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/terms/recommend-definition` | Generate English and Danish definition suggestions for a term using OpenAI. |

**Request:**
```json
{
  "term": "MPLS",
  "category_id": "network"
}
```

**Response:**
```json
{
  "en": "Multiprotocol Label Switching is a routing technique...",
  "da": "Multiprotocol Label Switching er en routingteknik...",
  "model": "gpt-4.1-mini"
}
```

Returns 503 if `OPENAI_API_KEY` is not configured or the AI provider returns an error. The `category_id` is optional; when provided, the category hierarchy breadcrumb is included in the AI prompt for context.

### Glossary Extraction

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/terms/extract-glossary` | Find all known glossary terms that appear in submitted text. |

**Request:**
```json
{
  "text": "The LTE network uses MPLS for backhaul routing."
}
```

**Response:** An array of matching `TermRead` objects (with their definitions). Matching uses word-boundary regex (case-insensitive), so "LTE" does not match inside "FILTER".

The `text` field has a maximum length of 50,000 characters.

## Error Responses

The API uses standard HTTP status codes with a `detail` field:

| Status | Meaning |
|--------|---------|
| 201 | Created (POST success) |
| 204 | No Content (DELETE success) |
| 401 | Missing or invalid authentication token |
| 403 | Insufficient role or scope |
| 404 | Resource not found |
| 409 | Conflict (duplicate unique field, or resource still referenced on delete) |
| 422 | Validation error (missing required field, FK reference not found) |
| 503 | External service unavailable (AI provider, JWKS fetch) |
