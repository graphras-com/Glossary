/**
 * Generic form component for creating and editing resources.
 *
 * Renders a form with fields based on the resource config.
 * Handles both top-level resources and nested children.
 *
 * Props:
 *   resource     — resource config object
 *   mode         — "create" | "edit"
 *   initialData  — pre-populated values (for edit mode)
 *   onSubmit     — async function(formData) called on submit
 *   onCancel     — function called when cancel is clicked
 *   submitLabel  — button label (defaults to "Create" or "Save Changes")
 *   title        — page heading
 *   children     — optional React nodes rendered before the form actions
 *                   (e.g. "Recommend definition" button)
 */

import { useState } from "react";
import ErrorMessage from "./ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function CrudForm({
  resource,
  mode = "create",
  initialData = {},
  onSubmit,
  onCancel,
  submitLabel,
  title,
  children: extraContent,
}) {
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();

  // Build initial form state from fields
  const formFields = resource.fields.filter((f) => {
    if (f.showInForm === false) return false;
    if (f.showInForm === "create-only" && mode === "edit") return false;
    if (f.showInForm === "edit-only" && mode === "create") return false;
    return true;
  });

  const buildInitialValues = () => {
    const values = {};
    for (const field of formFields) {
      values[field.name] = initialData[field.name] ?? "";
    }
    return values;
  };

  const [values, setValues] = useState(buildInitialValues);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // For resources with children: manage inline child forms
  const hasChildren = mode === "create" && resource.children && resource.children.length > 0;
  const [childRows, setChildRows] = useState(() => {
    if (!hasChildren) return {};
    const rows = {};
    for (const child of resource.children) {
      const existing = initialData[child.name];
      if (existing && existing.length > 0) {
        rows[child.name] = existing.map((row) => {
          const r = {};
          for (const f of child.fields) {
            r[f.name] = row[f.name] ?? "";
          }
          return r;
        });
      } else {
        // Start with one empty child row
        const emptyRow = {};
        for (const f of child.fields) {
          emptyRow[f.name] = "";
        }
        rows[child.name] = [emptyRow];
      }
    }
    return rows;
  });

  function handleChange(fieldName, value) {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  }

  function handleChildChange(childName, index, fieldName, value) {
    setChildRows((prev) => ({
      ...prev,
      [childName]: prev[childName].map((row, i) =>
        i === index ? { ...row, [fieldName]: value } : row
      ),
    }));
  }

  function addChildRow(childName, childFields) {
    const emptyRow = {};
    for (const f of childFields) {
      emptyRow[f.name] = "";
    }
    setChildRows((prev) => ({
      ...prev,
      [childName]: [...(prev[childName] || []), emptyRow],
    }));
  }

  function removeChildRow(childName, index) {
    setChildRows((prev) => ({
      ...prev,
      [childName]: prev[childName].filter((_, i) => i !== index),
    }));
  }

  // Allow external updates to child rows (e.g. from AI recommendation)
  function updateChildRow(childName, index, updates) {
    setChildRows((prev) => ({
      ...prev,
      [childName]: prev[childName].map((row, i) =>
        i === index ? { ...row, ...updates } : row
      ),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // Build the payload
      const payload = {};
      for (const field of formFields) {
        let val = values[field.name];
        if (field.nullable && val === "") val = null;
        payload[field.name] = val;
      }

      // Include children in payload for create mode
      if (hasChildren) {
        for (const child of resource.children) {
          payload[child.name] = (childRows[child.name] || []).map((row) => {
            const childPayload = {};
            for (const f of child.fields) {
              let val = row[f.name];
              if (f.nullable && val === "") val = null;
              childPayload[f.name] = val;
            }
            return childPayload;
          });
        }
      }

      await onSubmit(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Get source items for select fields.
   */
  function getSourceItems(field) {
    if (field.source === "categories") {
      // For category edit: exclude self to prevent circular references
      if (resource.name === "categories" && mode === "edit" && initialData.id) {
        return categories.filter((c) => c.id !== initialData.id);
      }
      return categories;
    }
    return [];
  }

  function renderField(field, value, onChange) {
    const id = `field-${field.name}`;
    const sourceItems = field.type === "select" ? getSourceItems(field) : [];

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            id={id}
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            rows={field.rows || 4}
          />
        );

      case "select":
        return (
          <select
            id={id}
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          >
            <option value="">
              {field.emptyLabel || `Select a ${field.label.toLowerCase()}...`}
            </option>
            {sourceItems.map((item) => (
              <option key={item.id} value={item.id}>
                {field.sourceLabel
                  ? field.sourceLabel(item, categoryBreadcrumb)
                  : field.source === "categories"
                  ? categoryBreadcrumb(item.id)
                  : item.label || item.id}
              </option>
            ))}
          </select>
        );

      case "number":
        return (
          <input
            id={id}
            type="number"
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
          />
        );

      default:
        return (
          <input
            id={id}
            type="text"
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            placeholder={field.placeholder || ""}
          />
        );
    }
  }

  const defaultSubmitLabel =
    mode === "create"
      ? `Create ${resource.labelSingular}`
      : "Save Changes";

  return (
    <div>
      <h1>{title || (mode === "create" ? `New ${resource.labelSingular}` : `Edit ${resource.labelSingular}`)}</h1>
      <ErrorMessage message={error} />

      <form onSubmit={handleSubmit} className="form">
        {/* Parent fields */}
        {formFields.map((field) => (
          <div key={field.name} className="form-group">
            <label htmlFor={`field-${field.name}`}>
              {field.label}
              {field.suffix ? ` ${field.suffix}` : ""}
            </label>
            {renderField(field, values[field.name], (val) =>
              handleChange(field.name, val)
            )}
          </div>
        ))}

        {/* Inline child forms (create mode only) */}
        {hasChildren &&
          resource.children.map((childCfg) => {
            const rows = childRows[childCfg.name] || [];
            const childFormFields = childCfg.fields.filter(
              (f) => f.showInForm !== false
            );
            return (
              <div key={childCfg.name}>
                <h3>{childCfg.label}</h3>
                {rows.map((row, i) => (
                  <div key={i} className="card form-card">
                    <div className="card-header">
                      <span>
                        {childCfg.labelSingular} {i + 1}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeChildRow(childCfg.name, i)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="card-body">
                      {childFormFields.map((field) => (
                        <div key={field.name} className="form-group">
                          <label htmlFor={`child-${childCfg.name}-${i}-${field.name}`}>
                            {field.label}
                            {field.suffix ? ` ${field.suffix}` : ""}
                          </label>
                          {renderField(
                            { ...field, id: `child-${childCfg.name}-${i}-${field.name}` },
                            row[field.name],
                            (val) => handleChildChange(childCfg.name, i, field.name, val)
                          )}
                        </div>
                      ))}
                      {/* Slot for extra per-child actions (e.g., "Recommend") */}
                      {typeof extraContent === "function"
                        ? extraContent({
                            childName: childCfg.name,
                            index: i,
                            row,
                            updateRow: (updates) =>
                              updateChildRow(childCfg.name, i, updates),
                          })
                        : null}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() => addChildRow(childCfg.name, childCfg.fields)}
                >
                  + Add Another {childCfg.labelSingular}
                </button>
              </div>
            );
          })}

        {/* Non-function extra content */}
        {extraContent && typeof extraContent !== "function" ? extraContent : null}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : submitLabel || defaultSubmitLabel}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
