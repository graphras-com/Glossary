/**
 * Generic API client with automatic Bearer token injection.
 *
 * This module is **generic** — it provides a base `request()` function
 * and auto-generates CRUD functions for each resource defined in the
 * resource config.  When creating a new application, you should not
 * need to modify this file.
 *
 * Domain-specific API functions (e.g. `recommendDefinition`) can be
 * added at the bottom of this file or in a separate module.
 */

import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../auth/msalInstance";
import { apiTokenRequest } from "../auth/msalConfig";
import { AUTH_DISABLED } from "../auth/AuthProvider";
import { resources } from "../config/resources";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Acquire an access token silently. Falls back to popup login
 * if interaction is required.
 */
async function getAccessToken() {
  if (AUTH_DISABLED) return null;

  const account = msalInstance.getActiveAccount();
  if (!account) {
    return null;
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...apiTokenRequest,
      account,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      try {
        const response = await msalInstance.acquireTokenPopup(apiTokenRequest);
        return response.accessToken;
      } catch {
        return null;
      }
    }
    console.error("Token acquisition failed:", error);
    return null;
  }
}

/**
 * Base HTTP request function with token injection and error handling.
 */
export async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  const token = await getAccessToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  const res = await fetch(url, config);

  if (res.status === 204) return null;

  if (res.status === 401 && !AUTH_DISABLED) {
    const account = msalInstance.getActiveAccount();
    if (account) {
      try {
        await msalInstance.acquireTokenPopup(apiTokenRequest);
      } catch {
        // popup was closed or failed
      }
    }
    throw new Error("Authentication required. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.detail || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return res.json();
}

// =========================================================================
// Auto-generated CRUD functions for each resource
// =========================================================================

/**
 * Build a query string from a params object, omitting empty values.
 */
function toQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) query.set(key, val);
  }
  return query.toString();
}

/**
 * Build CRUD API functions for a resource config.
 *
 * Returns an object with: list, get, create, update, delete
 * and optional nested child functions.
 */
function buildResourceApi(resource) {
  const path = resource.apiPath;
  const api = {
    list: (params) => {
      const qs = toQuery(params);
      return request(`${path}/${qs ? `?${qs}` : ""}`);
    },
    get: (id) => request(`${path}/${id}`),
    create: (data) =>
      request(`${path}/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id, data) =>
      request(`${path}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id) => request(`${path}/${id}`, { method: "DELETE" }),
  };

  // Nested child resource functions
  for (const child of resource.children || []) {
    api[child.name] = {
      create: (parentId, data) =>
        request(`${path}/${parentId}/${child.name}`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (parentId, childId, data) =>
        request(`${path}/${parentId}/${child.name}/${childId}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      delete: (parentId, childId) =>
        request(`${path}/${parentId}/${child.name}/${childId}`, {
          method: "DELETE",
        }),
    };
  }

  return api;
}

/**
 * Auto-generated API object.
 *
 * Usage:
 *   import { api } from "../api/client";
 *   const terms = await api.terms.list({ q: "LTE" });
 *   const term = await api.terms.get(1);
 *   await api.terms.definitions.create(termId, { en: "...", ... });
 */
export const api = {};
for (const resource of resources) {
  api[resource.name] = buildResourceApi(resource);
}

// =========================================================================
// Backward-compatible named exports (so existing code doesn't break)
// =========================================================================

// ── Categories ──
export function getCategories() {
  return api.categories.list();
}
export function getCategory(id) {
  return api.categories.get(id);
}
export function createCategory(data) {
  return api.categories.create(data);
}
export function updateCategory(id, data) {
  return api.categories.update(id, data);
}
export function deleteCategory(id) {
  return api.categories.delete(id);
}

// ── Terms ──
export function getTerms(params = {}) {
  return api.terms.list(params);
}
export function getTerm(id) {
  return api.terms.get(id);
}
export function createTerm(data) {
  return api.terms.create(data);
}
export function updateTerm(id, data) {
  return api.terms.update(id, data);
}
export function deleteTerm(id) {
  return api.terms.delete(id);
}

// ── Definitions (nested under terms) ──
export function createDefinition(termId, data) {
  return api.terms.definitions.create(termId, data);
}
export function updateDefinition(termId, definitionId, data) {
  return api.terms.definitions.update(termId, definitionId, data);
}
export function deleteDefinition(termId, definitionId) {
  return api.terms.definitions.delete(termId, definitionId);
}

// ── Backup / Restore ──
export function getBackup() {
  return request("/backup/");
}
export function restoreBackup(data) {
  return request("/backup/restore", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Domain-specific: AI Recommendation (app-specific, not auto-generated) ──
export function recommendDefinition(data) {
  return request("/terms/recommend-definition", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Domain-specific: AI Glossary Extraction (app-specific, not auto-generated) ──
export function extractGlossary(data) {
  return request("/terms/extract-glossary", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
