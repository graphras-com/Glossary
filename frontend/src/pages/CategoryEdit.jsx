import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCategory, updateCategory } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function CategoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories: allCategories, breadcrumb: categoryBreadcrumb } = useCategoryMap();
  const categories = allCategories.filter((c) => c.id !== id);
  const [label, setLabel] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCategory(id)
      .then((cat) => {
        setLabel(cat.label);
        setParentId(cat.parent_id || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await updateCategory(id, {
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

  if (loading) return <p className="loading">Loading...</p>;

  return (
    <div>
      <h1>Edit Category: <code>{id}</code></h1>
      <ErrorMessage message={error} />

      <form onSubmit={handleSubmit} className="form">
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
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" className="btn" onClick={() => navigate("/categories")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
