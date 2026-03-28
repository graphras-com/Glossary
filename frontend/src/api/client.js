/**
 * API client with automatic Bearer token injection.
 *
 * All requests to the backend automatically include an Authorization
 * header with an access token acquired silently from MSAL.
 * If silent acquisition fails (e.g. token expired, no session),
 * a popup is opened for re-authentication.
 */

import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { msalInstance } from "../auth/msalInstance";
import { apiTokenRequest } from "../auth/msalConfig";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Acquire an access token silently. Falls back to popup login
 * if interaction is required (expired refresh token, consent needed, etc.).
 *
 * @returns {Promise<string|null>} The access token, or null if unavailable.
 */
async function getAccessToken() {
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

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  // Acquire Bearer token
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

  // If we get a 401, the token might be expired – trigger re-auth
  if (res.status === 401) {
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

// ── Categories ──

export function getCategories() {
  return request("/categories/");
}

export function getCategory(id) {
  return request(`/categories/${id}`);
}

export function createCategory(data) {
  return request("/categories/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(id, data) {
  return request(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id) {
  return request(`/categories/${id}`, { method: "DELETE" });
}

// ── Terms ──

export function getTerms(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  const qs = query.toString();
  return request(`/terms/${qs ? `?${qs}` : ""}`);
}

export function getTerm(id) {
  return request(`/terms/${id}`);
}

export function createTerm(data) {
  return request("/terms/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function recommendDefinition(data) {
  return request("/terms/recommend-definition", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTerm(id, data) {
  return request(`/terms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTerm(id) {
  return request(`/terms/${id}`, { method: "DELETE" });
}

// ── Definitions (nested under terms) ──

export function createDefinition(termId, data) {
  return request(`/terms/${termId}/definitions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateDefinition(termId, definitionId, data) {
  return request(`/terms/${termId}/definitions/${definitionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteDefinition(termId, definitionId) {
  return request(`/terms/${termId}/definitions/${definitionId}`, {
    method: "DELETE",
  });
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
