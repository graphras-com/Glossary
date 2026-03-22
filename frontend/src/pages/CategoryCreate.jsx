import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCategory } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function CategoryCreate() {
  const navigate = useNavigate();
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await createCategory({
        id,
        label,
        parent_id: parentId || null,
      });
      navigate("/categories");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>New Category</h1>
      <ErrorMessage message={error} />

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>ID</label>
          <input
            type="text"
            className="input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. network.wireless"
            required
          />
        </div>

        <div className="form-group">
          <label>Label</label>
          <input
            type="text"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Parent Category (optional)</label>
          <select
            className="input"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">None (top-level)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryBreadcrumb(c.id)} ({c.id})
              </option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create Category"}
          </button>
          <button type="button" className="btn" onClick={() => navigate("/categories")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
