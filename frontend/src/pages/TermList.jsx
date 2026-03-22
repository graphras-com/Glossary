import { useEffect, useState } from "react";
import { Link, useSearchParams, useLocation } from "react-router-dom";
import { getTerms, deleteTerm, deleteDefinition } from "../api/client";
import ConfirmButton from "../components/ConfirmButton";
import ErrorMessage from "../components/ErrorMessage";
import useCategoryMap from "../hooks/useCategoryMap";

export default function TermList() {
  const [terms, setTerms] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { categories, breadcrumb: categoryBreadcrumb } = useCategoryMap();

  const q = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";

  useEffect(() => {
    if (!loading && location.state?.scrollToTerm) {
      const el = document.getElementById(`term-${location.state.scrollToTerm}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Clear state so it doesn't scroll again on re-renders
      window.history.replaceState({}, "");
    }
  }, [loading, location.state]);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = {};
    if (q) params.q = q;
    if (category) params.category = category;
    getTerms(params)
      .then(setTerms)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, category]);

  function handleSearch(e) {
    const value = e.target.value;
    const params = {};
    if (value) params.q = value;
    if (category) params.category = category;
    setSearchParams(params);
  }

  function handleCategoryFilter(e) {
    const value = e.target.value;
    const params = {};
    if (q) params.q = q;
    if (value) params.category = value;
    setSearchParams(params);
  }

  async function handleDeleteTerm(id) {
    try {
      await deleteTerm(id);
      setTerms((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteDefinition(termId, defId) {
    try {
      await deleteDefinition(termId, defId);
      setTerms((prev) =>
        prev.map((t) =>
          t.id === termId
            ? { ...t, definitions: t.definitions.filter((d) => d.id !== defId) }
            : t
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownloadPdf() {
    // Fetch ALL terms (ignoring current filters) sorted alphabetically
    let allTerms;
    try {
      allTerms = await getTerms();
    } catch (err) {
      setError(err.message);
      return;
    }

    const sorted = [...allTerms].sort((a, b) =>
      a.term.localeCompare(b.term, undefined, { sensitivity: "base" })
    );

    const [{ default: jsPDF }, { default: generateGlossaryPdf }] =
      await Promise.all([
        import("jspdf"),
        import("../pdf/generateGlossaryPdf"),
      ]);

    const doc = generateGlossaryPdf(jsPDF, sorted, categoryBreadcrumb);
    doc.save("glossary.pdf");
  }

  return (
    <div>
      <div className="page-header">
        <h1>Glossary</h1>
        <div className="page-header-actions">
          {!loading && terms.length > 0 && (
            <button className="btn" onClick={handleDownloadPdf}>
              Download PDF
            </button>
          )}
          <Link to="/terms/new" className="btn btn-primary">
            + New Term
          </Link>
        </div>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search terms..."
          value={q}
          onChange={handleSearch}
          className="input"
        />
        <select value={category} onChange={handleCategoryFilter} className="input">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryBreadcrumb(c.id)}
            </option>
          ))}
        </select>
      </div>

      <ErrorMessage message={error} />

      {loading ? (
        <p className="loading">Loading...</p>
      ) : terms.length === 0 ? (
        <p className="empty">No terms found.</p>
      ) : (
        <div className="glossary">
          {terms.map((term) => (
            <div key={term.id} id={`term-${term.id}`} className="glossary-entry">
              <div className="glossary-term-row">
                <h2 className="glossary-term">{term.term}</h2>
                <div className="glossary-term-actions">
                  <Link to={`/terms/${term.id}/edit`} className="btn btn-sm">
                    Edit
                  </Link>
                  <Link to={`/terms/${term.id}/definitions/new`} className="btn btn-sm">
                    + Definition
                  </Link>
                  <ConfirmButton onConfirm={() => handleDeleteTerm(term.id)} className="btn-sm">
                    Delete
                  </ConfirmButton>
                </div>
              </div>

              {term.definitions.length === 0 ? (
                <p className="glossary-no-defs">No definitions yet.</p>
              ) : (
                <div className="glossary-definitions">
                  {term.definitions.map((def, i) => (
                    <div key={def.id} className="glossary-def">
                      <div className="glossary-def-content">
                        {term.definitions.length > 1 && (
                          <span className="glossary-def-num">{i + 1}.</span>
                        )}
                        <div className="glossary-def-text">
                          <p className="glossary-def-en">{def.en}</p>
                          {def.da && (
                            <p className="glossary-def-da">{def.da}</p>
                          )}
                          <span className="badge">{categoryBreadcrumb(def.category_id)}</span>
                        </div>
                      </div>
                      <div className="glossary-def-actions">
                        <Link
                          to={`/terms/${term.id}/definitions/${def.id}/edit`}
                          className="btn btn-sm"
                        >
                          Edit
                        </Link>
                        <ConfirmButton
                          onConfirm={() => handleDeleteDefinition(term.id, def.id)}
                          className="btn-sm"
                        >
                          Delete
                        </ConfirmButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
