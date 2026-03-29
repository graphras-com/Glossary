/**
 * Generic detail page component for a single resource.
 *
 * Shows the resource's fields and any nested children with
 * edit/delete actions.
 *
 * Props:
 *   resource — resource config object from resources.js
 */

import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import ConfirmButton from "./ConfirmButton";
import ErrorMessage from "./ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function CrudDetail({ resource }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { breadcrumb: categoryBreadcrumb } = useCategoryMap();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api[resource.name]
      .get(id)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, resource.name]);

  async function handleDelete() {
    await api[resource.name].delete(id);
    navigate(`/${resource.name}`);
  }

  async function handleDeleteChild(childCfg, childId) {
    try {
      await api[resource.name][childCfg.name].delete(id, childId);
      setItem((prev) => ({
        ...prev,
        [childCfg.name]: prev[childCfg.name].filter((c) => c.id !== childId),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="loading">Loading...</p>;
  if (error) return <ErrorMessage message={error} />;
  if (!item) return <p className="empty">{resource.labelSingular} not found.</p>;

  const mainField = resource.fields[0];
  const pk = item[resource.pkField];

  return (
    <div>
      <div className="page-header">
        <h1>{item[mainField.name]}</h1>
        <div className="actions">
          <Link to={`/${resource.name}/${pk}/edit`} className="btn btn-primary">
            Edit {resource.labelSingular}
          </Link>
          {(resource.children || []).map((childCfg) => (
            <Link
              key={childCfg.name}
              to={`/${resource.name}/${pk}/${childCfg.name}/new`}
              className="btn btn-primary"
            >
              + Add {childCfg.labelSingular}
            </Link>
          ))}
          <ConfirmButton onConfirm={handleDelete}>
            Delete {resource.labelSingular}
          </ConfirmButton>
        </div>
      </div>

      <p className="meta">
        {resource.labelSingular} ID: {pk}
      </p>

      {/* Render fields (beyond the main/first field) */}
      {resource.fields.slice(1).map((field) => {
        const val = item[field.name];
        if (val == null) return null;
        return (
          <p key={field.name}>
            <strong>{field.label}:</strong>{" "}
            {field.type === "select" && field.source === "categories"
              ? categoryBreadcrumb(val)
              : val}
          </p>
        );
      })}

      {/* Nested children */}
      {(resource.children || []).map((childCfg) => {
        const childItems = item[childCfg.name] || [];
        return (
          <div key={childCfg.name}>
            <h2>{childCfg.label}</h2>
            {childItems.length === 0 ? (
              <p className="empty">No {childCfg.label.toLowerCase()} yet.</p>
            ) : (
              <div className="definitions-list">
                {childItems.map((child) => (
                  <div key={child.id} className="card">
                    <div className="card-header">
                      {childCfg.fields
                        .filter((f) => f.type === "select" && f.source === "categories")
                        .map((f) => (
                          <span key={f.name} className="badge">
                            {child[f.name]}
                          </span>
                        ))}
                      <div className="actions">
                        <Link
                          to={`/${resource.name}/${pk}/${childCfg.name}/${child.id}/edit`}
                          className="btn btn-sm"
                        >
                          Edit
                        </Link>
                        <ConfirmButton
                          onConfirm={() => handleDeleteChild(childCfg, child.id)}
                          className="btn-sm"
                        >
                          Delete
                        </ConfirmButton>
                      </div>
                    </div>
                    <div className="card-body">
                      {childCfg.fields
                        .filter((f) => f.showInList && f.type !== "select")
                        .map((f) => {
                          const val = child[f.name];
                          if (val == null) return null;
                          return (
                            <p key={f.name}>
                              <strong>{f.label}:</strong> {val}
                            </p>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Link to={`/${resource.name}`} className="btn btn-back">
        &larr; Back to {resource.label}
      </Link>
    </div>
  );
}
