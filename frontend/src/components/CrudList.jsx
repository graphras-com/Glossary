/**
 * Generic list page component.
 *
 * Renders a list/table view for any resource defined in the config.
 * Supports search, FK-based filters, table and detail-card layouts,
 * and nested child resources rendered inline.
 *
 * Props:
 *   resource     — resource config object from resources.js
 *   extraActions — optional React node(s) for additional header buttons
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { api } from "../api/client";
import ConfirmButton from "./ConfirmButton";
import ErrorMessage from "./ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function CrudList({ resource, extraActions }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();

  const q = searchParams.get("q") || "";
  const filterValues = {};
  for (const f of resource.filters || []) {
    filterValues[f.param] = searchParams.get(f.param) || "";
  }

  // Serialise filter values for use as a stable dependency
  const filterKey = JSON.stringify(filterValues);

  // Scroll to item after navigation
  useEffect(() => {
    if (!loading && location.state?.scrollToItem) {
      const el = document.getElementById(`item-${location.state.scrollToItem}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      window.history.replaceState({}, "");
    }
  }, [loading, location.state]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(filterKey);
    const params = {};
    if (q) params.q = q;
    for (const [key, val] of Object.entries(parsed)) {
      if (val) params[key] = val;
    }
    api[resource.name]
      .list(params)
      .then((data) => { if (!cancelled) { setItems(data); } })
      .catch((err) => { if (!cancelled) { setError(err.message); } })
      .finally(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [q, filterKey, resource.name]);

  function handleSearch(e) {
    const value = e.target.value;
    const params = {};
    if (value) params.q = value;
    for (const [key, val] of Object.entries(filterValues)) {
      if (val) params[key] = val;
    }
    setSearchParams(params);
  }

  function handleFilterChange(paramName, value) {
    const params = {};
    if (q) params.q = q;
    for (const [key, val] of Object.entries(filterValues)) {
      if (key === paramName) {
        if (value) params[key] = value;
      } else if (val) {
        params[key] = val;
      }
    }
    setSearchParams(params);
  }

  async function handleDelete(id) {
    try {
      await api[resource.name].delete(id);
      setItems((prev) => prev.filter((item) => item[resource.pkField] !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteChild(childCfg, parentId, childId) {
    try {
      await api[resource.name][childCfg.name].delete(parentId, childId);
      setItems((prev) =>
        prev.map((item) =>
          item[resource.pkField] === parentId
            ? {
                ...item,
                [childCfg.name]: item[childCfg.name].filter(
                  (c) => c.id !== childId
                ),
              }
            : item
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Resolve display value for a field.
   */
  const renderFieldValue = useCallback(
    (field, value) => {
      if (value == null) return <span className="muted">--</span>;
      if (field.render === "code") return <code>{value}</code>;
      if (field.type === "select" && field.source === "categories") {
        return categoryBreadcrumb(value);
      }
      return value;
    },
    [categoryBreadcrumb]
  );

  /**
   * Get source items for a select-type filter.
   */
  function getFilterSourceItems(filter) {
    if (filter.source === "categories") return categories;
    return [];
  }

  // ── Table Layout ──────────────────────────────────────────────────
  function renderTable() {
    const listFields = resource.fields.filter((f) => f.showInList);
    return (
      <table className="table">
        <thead>
          <tr>
            {listFields.map((f) => (
              <th key={f.name}>{f.label}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item[resource.pkField]}>
              {listFields.map((f) => (
                <td key={f.name}>
                  {renderFieldValue(f, item[f.name])}
                </td>
              ))}
              <td className="actions">
                <Link
                  to={`/${resource.name}/${item[resource.pkField]}/edit`}
                  className="btn btn-sm"
                >
                  Edit
                </Link>
                <ConfirmButton
                  onConfirm={() => handleDelete(item[resource.pkField])}
                  className="btn-sm"
                >
                  Delete
                </ConfirmButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Detail Cards Layout (parent + inline children) ────────────────
  function renderDetailCards() {
    const mainField = resource.fields.find((f) => f.showInList) || resource.fields[0];
    return (
      <div className="glossary">
        {items.map((item) => {
          const pk = item[resource.pkField];
          return (
            <div key={pk} id={`item-${pk}`} className="glossary-entry">
              <div className="glossary-term-row">
                <h2 className="glossary-term">{item[mainField.name]}</h2>
                <div className="glossary-term-actions">
                  <Link to={`/${resource.name}/${pk}/edit`} className="btn btn-sm">
                    Edit
                  </Link>
                  {(resource.children || []).map((childCfg) => (
                    <Link
                      key={childCfg.name}
                      to={`/${resource.name}/${pk}/${childCfg.name}/new`}
                      className="btn btn-sm"
                    >
                      + {childCfg.labelSingular}
                    </Link>
                  ))}
                  <ConfirmButton onConfirm={() => handleDelete(pk)} className="btn-sm">
                    Delete
                  </ConfirmButton>
                </div>
              </div>

              {/* Render children inline */}
              {(resource.children || []).map((childCfg) => {
                const childItems = item[childCfg.name] || [];
                if (childItems.length === 0) {
                  return (
                    <p key={childCfg.name} className="glossary-no-defs">
                      No {childCfg.label.toLowerCase()} yet.
                    </p>
                  );
                }
                return (
                  <div key={childCfg.name} className="glossary-definitions">
                    {childItems.map((child, i) => (
                      <div key={child.id} className="glossary-def">
                        <div className="glossary-def-content">
                          {childItems.length > 1 && (
                            <span className="glossary-def-num">{i + 1}.</span>
                          )}
                          <div className="glossary-def-text">
                            {childCfg.fields
                              .filter((f) => f.showInList)
                              .map((f) => {
                                const val = child[f.name];
                                if (val == null) return null;
                                if (f.type === "select" && f.source === "categories") {
                                  return (
                                    <span key={f.name} className="badge">
                                      {categoryBreadcrumb(val)}
                                    </span>
                                  );
                                }
                                // First text field rendered as primary, rest as secondary
                                const isFirst = childCfg.fields.filter((ff) => ff.showInList)[0]?.name === f.name;
                                return (
                                  <p
                                    key={f.name}
                                    className={isFirst ? "glossary-def-en" : "glossary-def-da"}
                                  >
                                    {val}
                                  </p>
                                );
                              })}
                          </div>
                        </div>
                        <div className="glossary-def-actions">
                          <Link
                            to={`/${resource.name}/${pk}/${childCfg.name}/${child.id}/edit`}
                            className="btn btn-sm"
                          >
                            Edit
                          </Link>
                          <ConfirmButton
                            onConfirm={() => handleDeleteChild(childCfg, pk, child.id)}
                            className="btn-sm"
                          >
                            Delete
                          </ConfirmButton>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{resource.label}</h1>
        <div className="page-header-actions">
          {extraActions}
          <Link to={`/${resource.name}/new`} className="btn btn-primary">
            + New {resource.labelSingular}
          </Link>
        </div>
      </div>

      {/* Search and filters */}
      {(resource.searchable || (resource.filters && resource.filters.length > 0)) && (
        <div className="filters">
          {resource.searchable && (
            <input
              type="text"
              placeholder={resource.searchPlaceholder || `Search ${resource.label.toLowerCase()}...`}
              value={q}
              onChange={handleSearch}
              className="input"
            />
          )}
          {(resource.filters || []).map((filter) => (
            <select
              key={filter.param}
              value={filterValues[filter.param]}
              onChange={(e) => handleFilterChange(filter.param, e.target.value)}
              className="input"
            >
              <option value="">{filter.emptyLabel || `All ${filter.label}`}</option>
              {getFilterSourceItems(filter).map((item) => (
                <option key={item.id} value={item.id}>
                  {filter.source === "categories"
                    ? categoryBreadcrumb(item.id)
                    : item.label || item.id}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      <ErrorMessage message={error} />

      {loading ? (
        <p className="loading">Loading...</p>
      ) : items.length === 0 ? (
        <p className="empty">No {resource.label.toLowerCase()} found.</p>
      ) : resource.listDisplay === "table" ? (
        renderTable()
      ) : (
        renderDetailCards()
      )}
    </div>
  );
}
