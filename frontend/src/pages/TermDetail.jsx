import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getTerm, deleteTerm, deleteDefinition } from "../api/client";
import ConfirmButton from "../components/ConfirmButton";
import ErrorMessage from "../components/ErrorMessage";

export default function TermDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [term, setTerm] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getTerm(id)
      .then((data) => {
        if (!cancelled) setTerm(data);
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
  }, [id]);

  async function handleDeleteTerm() {
    await deleteTerm(id);
    navigate("/terms");
  }

  async function handleDeleteDefinition(defId) {
    try {
      await deleteDefinition(id, defId);
      setTerm((prev) => ({
        ...prev,
        definitions: prev.definitions.filter((d) => d.id !== defId),
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="loading">Loading...</p>;
  if (error) return <ErrorMessage message={error} />;
  if (!term) return <p className="empty">Term not found.</p>;

  return (
    <div>
      <div className="page-header">
        <h1>{term.term}</h1>
        <div className="actions">
          <Link to={`/terms/${id}/edit`} className="btn btn-primary">
            Edit Term
          </Link>
          <Link to={`/terms/${id}/definitions/new`} className="btn btn-primary">
            + Add Definition
          </Link>
          <ConfirmButton onConfirm={handleDeleteTerm}>Delete Term</ConfirmButton>
        </div>
      </div>

      <p className="meta">Term ID: {term.id}</p>

      <h2>Definitions</h2>
      {term.definitions.length === 0 ? (
        <p className="empty">No definitions yet.</p>
      ) : (
        <div className="definitions-list">
          {term.definitions.map((def) => (
            <div key={def.id} className="card">
              <div className="card-header">
                <span className="badge">{def.category_id}</span>
                <div className="actions">
                  <Link
                    to={`/terms/${id}/definitions/${def.id}/edit`}
                    className="btn btn-sm"
                  >
                    Edit
                  </Link>
                  <ConfirmButton
                    onConfirm={() => handleDeleteDefinition(def.id)}
                    className="btn-sm"
                  >
                    Delete
                  </ConfirmButton>
                </div>
              </div>
              <div className="card-body">
                <p>
                  <strong>EN:</strong> {def.en}
                </p>
                {def.da && (
                  <p>
                    <strong>DA:</strong> {def.da}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/terms" className="btn btn-back">
        &larr; Back to Terms
      </Link>
    </div>
  );
}
