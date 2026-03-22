import { useEffect, useState, useCallback } from "react";
import { getCategories } from "../api/client";

/**
 * Build a breadcrumb string for a category by walking up the parent chain.
 * Pure function — no React dependency.
 *
 * @param {string} categoryId
 * @param {Record<string, {id: string, label: string, parent_id: string|null}>} categoryMap
 * @returns {string} e.g. "Network \u00BB Mobile"
 */
export function categoryBreadcrumb(categoryId, categoryMap) {
  const parts = [];
  let current = categoryMap[categoryId];
  while (current) {
    parts.unshift(current.label);
    current = current.parent_id ? categoryMap[current.parent_id] : null;
  }
  return parts.length > 0 ? parts.join(" \u00BB ") : categoryId;
}

/**
 * Custom hook that fetches all categories once and provides:
 *   - categories: the raw array
 *   - categoryMap: { [id]: category }
 *   - breadcrumb(id): memoised breadcrumb builder
 */
export default function useCategoryMap() {
  const [categories, setCategories] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});

  useEffect(() => {
    getCategories()
      .then((cats) => {
        setCategories(cats);
        const map = {};
        cats.forEach((c) => (map[c.id] = c));
        setCategoryMap(map);
      })
      .catch(() => {});
  }, []);

  const breadcrumb = useCallback(
    (id) => categoryBreadcrumb(id, categoryMap),
    [categoryMap]
  );

  return { categories, categoryMap, breadcrumb };
}
