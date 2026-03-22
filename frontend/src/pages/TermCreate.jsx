import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTerm } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function TermCreate() {
  const navigate = useNavigate();
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();
  const [termName, setTermName] = useState("");
  const [definitions, setDefinitions] = useState([
    { en: "", da: "", category_id: "" },
  ]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addDefinition() {
    setDefinitions([...definitions, { en: "", da: "", category_id: "" }]);
  }

  function removeDefinition(index) {
    if (definitions.length <= 1) return;
    setDefinitions(definitions.filter((_, i) => i !== index));
  }

  function updateDefinition(index, field, value) {
    setDefinitions(
      definitions.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const payload = {
      term: termName,
      definitions: definitions.map((d) => ({
        en: d.en,
        da: d.da || null,
        category_id: d.category_id,
      })),
    };

    try {
      const created = await createTerm(payload);
      navigate("/terms", { state: { scrollToTerm: created.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>New Term</h1>
      <ErrorMessage message={error} />

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Term</label>
          <input
            type="text"
            className="input"
            value={termName}
            onChange={(e) => setTermName(e.target.value)}
            required
          />
        </div>

        <h3>Definitions</h3>
        {definitions.map((def, i) => (
          <div key={i} className="card form-card">
            <div className="card-header">
              <span>Definition {i + 1}</span>
              {definitions.length > 1 && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeDefinition(i)}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>English</label>
                <textarea
                  className="input"
                  value={def.en}
                  onChange={(e) => updateDefinition(i, "en", e.target.value)}
                  required
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Danish (optional)</label>
                <textarea
                  className="input"
                  value={def.da}
                  onChange={(e) => updateDefinition(i, "da", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  className="input"
                  value={def.category_id}
                  onChange={(e) => updateDefinition(i, "category_id", e.target.value)}
                  required
                >
                  <option value="">Select a category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryBreadcrumb(c.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        <button type="button" className="btn" onClick={addDefinition}>
          + Add Another Definition
        </button>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating..." : "Create Term"}
          </button>
          <button type="button" className="btn" onClick={() => navigate("/terms")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
