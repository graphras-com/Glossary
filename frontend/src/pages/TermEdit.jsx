import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTerm, updateTerm } from "../api/client";
import ErrorMessage from "../components/ErrorMessage";

export default function TermEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [termName, setTermName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTerm(id)
      .then((t) => {
        setTermName(t.term);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await updateTerm(id, { term: termName });
      navigate("/terms", { state: { scrollToTerm: Number(id) } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="loading">Loading...</p>;

  return (
    <div>
      <h1>Edit Term</h1>
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

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" className="btn" onClick={() => navigate("/terms", { state: { scrollToTerm: Number(id) } })}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
