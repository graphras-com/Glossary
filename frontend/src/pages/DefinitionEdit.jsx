import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { updateDefinition, getTerm } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function DefinitionEdit() {
  const { termId, definitionId } = useParams();
  const navigate = useNavigate();
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();
  const [termName, setTermName] = useState("");
  const [en, setEn] = useState("");
  const [da, setDa] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTerm(termId)
      .then((term) => {
        setTermName(term.term);
        const def = term.definitions.find((d) => d.id === Number(definitionId));
        if (def) {
          setEn(def.en);
          setDa(def.da || "");
          setCategoryId(def.category_id);
        } else {
          setError("Definition not found");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [termId, definitionId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await updateDefinition(termId, definitionId, {
        en,
        da: da || null,
        category_id: categoryId,
      });
      navigate("/terms", { state: { scrollToTerm: termId } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="loading">Loading...</p>;

  return (
    <div>
      <h1>Edit Definition for &ldquo;{termName}&rdquo;</h1>
      <ErrorMessage message={error} />

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>English Definition</label>
          <textarea
            className="input"
            value={en}
            onChange={(e) => setEn(e.target.value)}
            required
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Danish Definition (optional)</label>
          <textarea
            className="input"
            value={da}
            onChange={(e) => setDa(e.target.value)}
            rows={4}
          />
        </div>

        <div className="form-group">
          <label>Category</label>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" className="btn" onClick={() => navigate(`/terms/${termId}`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
