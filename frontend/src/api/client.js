const BASE_URL = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };

  const res = await fetch(url, config);

  if (res.status === 204) return null;

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
