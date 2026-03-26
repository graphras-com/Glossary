/**
 * Shared mock data and route-mocking helpers for Playwright tests.
 *
 * Every test calls `mockApi(page)` before navigating.  This intercepts
 * all requests to the FastAPI backend (http://localhost:8000/*) and
 * returns deterministic JSON so the tests run without a real server.
 *
 * The helpers return mutable references to the data arrays so individual
 * tests can inspect / mutate state when verifying CRUD behaviour.
 */

export const CATEGORIES = [
  { id: "commercial", parent_id: null, label: "Commercial" },
  { id: "commercial.retail", parent_id: "commercial", label: "Retail" },
  { id: "network", parent_id: null, label: "Network" },
  { id: "network.mobile", parent_id: "network", label: "Mobile" },
  { id: "transmission", parent_id: null, label: "Transmission" },
  {
    id: "transmission.submarine_cable",
    parent_id: "transmission",
    label: "Submarine Cable",
  },
];

export const TERMS = [
  {
    id: 1,
    term: "Bandwidth",
    definitions: [
      {
        id: 10,
        en: "The maximum rate of data transfer across a given path.",
        da: "Den maksimale dataoverførselshastighed.",
        category_id: "network",
      },
    ],
  },
  {
    id: 2,
    term: "Latency",
    definitions: [
      {
        id: 20,
        en: "The delay before a transfer of data begins following an instruction.",
        da: null,
        category_id: "network.mobile",
      },
      {
        id: 21,
        en: "Round-trip time for a packet.",
        da: "Rundturstid for en pakke.",
        category_id: "transmission",
      },
    ],
  },
  {
    id: 3,
    term: "Churn",
    definitions: [
      {
        id: 30,
        en: "The rate at which subscribers leave a service.",
        da: null,
        category_id: "commercial.retail",
      },
    ],
  },
];

let nextTermId = 100;
let nextDefId = 1000;

/**
 * Intercept all backend API calls and respond with mock data.
 * Returns `{ categories, terms }` so tests can inspect state.
 */
export async function mockApi(page) {
  const categories = structuredClone(CATEGORIES);
  const terms = structuredClone(TERMS);
  nextTermId = 100;
  nextDefId = 1000;

  // ── Catch-all for API requests ──
  // Matches requests to the Vite dev server (localhost:5173) for API paths,
  // or direct requests to the backend (localhost:8000).
  // We check the Accept header to avoid intercepting HTML page navigations.
  await page.route(/localhost:(5173|8000)\/(categories|terms|backup|health)/, async (route) => {
    // Let page navigations (HTML requests) pass through to Vite dev server
    const accept = route.request().headers()["accept"] || "";
    if (accept.includes("text/html")) {
      return route.fallback();
    }

    const method = route.request().method();
    const url = route.request().url();
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/$/, ""); // normalize: strip trailing slash

    // ── Categories list: /categories ──
    if (pathname === "/categories") {
      if (method === "GET") {
        return route.fulfill({ json: categories });
      }
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const cat = {
          id: body.id,
          parent_id: body.parent_id || null,
          label: body.label,
        };
        categories.push(cat);
        return route.fulfill({ status: 201, json: cat });
      }
      return route.fallback();
    }

    // ── Category detail: /categories/{id} ──
    const catDetailMatch = pathname.match(/^\/categories\/(.+)$/);
    if (catDetailMatch) {
      const id = decodeURIComponent(catDetailMatch[1]);
      const idx = categories.findIndex((c) => c.id === id);

      if (method === "GET") {
        if (idx === -1)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        return route.fulfill({ json: categories[idx] });
      }
      if (method === "PATCH") {
        if (idx === -1)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const body = route.request().postDataJSON();
        if (body.label !== undefined) categories[idx].label = body.label;
        if (body.parent_id !== undefined)
          categories[idx].parent_id = body.parent_id;
        return route.fulfill({ json: categories[idx] });
      }
      if (method === "DELETE") {
        if (idx === -1)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        categories.splice(idx, 1);
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    }

    // ── Terms list: /terms ──
    if (pathname === "/terms") {
      if (method === "GET") {
        const q = parsed.searchParams.get("q")?.toLowerCase();
        const cat = parsed.searchParams.get("category");
        let result = terms;
        if (q)
          result = result.filter((t) => t.term.toLowerCase().includes(q));
        if (cat)
          result = result.filter((t) =>
            t.definitions.some((d) => d.category_id === cat)
          );
        return route.fulfill({ json: result });
      }
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const term = {
          id: ++nextTermId,
          term: body.term,
          definitions: body.definitions.map((d) => ({
            id: ++nextDefId,
            en: d.en,
            da: d.da || null,
            category_id: d.category_id,
          })),
        };
        terms.push(term);
        return route.fulfill({ status: 201, json: term });
      }
      return route.fallback();
    }

    if (pathname === "/terms/recommend-definition") {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        return route.fulfill({
          json: {
            en: `A concise definition for ${body.term}.`,
            da: `En kort definition af ${body.term}.`,
            model: "gpt-4.1-mini",
          },
        });
      }
      return route.fallback();
    }

    // ── Term definitions: /terms/{id}/definitions or /terms/{id}/definitions/{defId} ──
    const defDetailMatch = pathname.match(
      /^\/terms\/(\d+)\/definitions\/(\d+)$/
    );
    if (defDetailMatch) {
      const termId = Number(defDetailMatch[1]);
      const defId = Number(defDetailMatch[2]);
      const term = terms.find((t) => t.id === termId);

      if (method === "PATCH") {
        if (!term)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const def = term.definitions.find((d) => d.id === defId);
        if (!def)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const body = route.request().postDataJSON();
        if (body.en !== undefined) def.en = body.en;
        if (body.da !== undefined) def.da = body.da;
        if (body.category_id !== undefined) def.category_id = body.category_id;
        return route.fulfill({ json: def });
      }
      if (method === "DELETE") {
        if (!term)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const idx = term.definitions.findIndex((d) => d.id === defId);
        if (idx === -1)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        term.definitions.splice(idx, 1);
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    }

    const defListMatch = pathname.match(/^\/terms\/(\d+)\/definitions$/);
    if (defListMatch) {
      const termId = Number(defListMatch[1]);
      const term = terms.find((t) => t.id === termId);

      if (method === "POST") {
        if (!term)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const body = route.request().postDataJSON();
        const def = {
          id: ++nextDefId,
          en: body.en,
          da: body.da || null,
          category_id: body.category_id,
        };
        term.definitions.push(def);
        return route.fulfill({ status: 201, json: def });
      }
      return route.fallback();
    }

    // ── Term detail: /terms/{id} ──
    const termDetailMatch = pathname.match(/^\/terms\/(\d+)$/);
    if (termDetailMatch) {
      const termId = Number(termDetailMatch[1]);
      const term = terms.find((t) => t.id === termId);

      if (method === "GET") {
        if (!term)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        return route.fulfill({ json: term });
      }
      if (method === "PATCH") {
        if (!term)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        const body = route.request().postDataJSON();
        if (body.term !== undefined) term.term = body.term;
        return route.fulfill({ json: term });
      }
      if (method === "DELETE") {
        const idx = terms.findIndex((t) => t.id === termId);
        if (idx === -1)
          return route.fulfill({
            status: 404,
            json: { detail: "Not found" },
          });
        terms.splice(idx, 1);
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    }

    // ── Backup: /backup ──
    if (pathname === "/backup") {
      if (method === "GET") {
        return route.fulfill({
          json: {
            version: 1,
            categories: categories.map((c) => ({
              id: c.id,
              parent_id: c.parent_id,
              label: c.label,
            })),
            terms: terms.map((t) => ({
              term: t.term,
              definitions: t.definitions.map((d) => ({
                en: d.en,
                da: d.da,
                category_id: d.category_id,
              })),
            })),
          },
        });
      }
      return route.fallback();
    }

    // ── Restore: /backup/restore ──
    if (pathname === "/backup/restore") {
      if (method === "POST") {
        const body = route.request().postDataJSON();
        // Replace mock data
        categories.length = 0;
        if (body.categories) body.categories.forEach((c) => categories.push(c));
        terms.length = 0;
        if (body.terms) {
          body.terms.forEach((t, i) => {
            terms.push({
              id: i + 1,
              term: t.term,
              definitions: (t.definitions || []).map((d, j) => ({
                id: (i + 1) * 100 + j,
                en: d.en,
                da: d.da || null,
                category_id: d.category_id,
              })),
            });
          });
        }
        return route.fulfill({
          json: {
            status: "ok",
            categories: categories.length,
            terms: terms.length,
          },
        });
      }
      return route.fallback();
    }

    // Unmatched – let it fall through
    return route.fallback();
  });

  return { categories, terms };
}
