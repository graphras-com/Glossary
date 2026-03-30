/**
 * Home page — term lookup, glossary list builder, and AI glossary extraction.
 *
 * Users search for terms, add them to a session-scoped glossary list,
 * choose a language (English or Danish), and copy the list as an HTML
 * table that pastes cleanly into MS Word.
 *
 * The "Generate from text" section lets users paste free text and have
 * the AI extract telecom terms with definitions, rendered in the same
 * copyable table format.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getTerms, extractGlossary } from "../api/client";
import { appConfig } from "../config/resources";
import useGlossaryList from "../hooks/useGlossaryList";

export default function Home() {
  const {
    items,
    language,
    setLanguage,
    addTerm,
    removeTerm,
    clearList,
    copyAsHtml,
  } = useGlossaryList();

  /* ── Search state ── */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  /* ── Extract-glossary state ── */
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractText, setExtractText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [extractResult, setExtractResult] = useState(null); // { terms, model }
  const [extractCopied, setExtractCopied] = useState(false);

  /* Debounced search */
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    setSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await getTerms({ q: query.trim() });
        setResults(data);
        setDropdownOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  /* Close dropdown on outside click */
  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelectTerm(term) {
    addTerm(term);
    setQuery("");
    setResults([]);
    setDropdownOpen(false);
  }

  async function handleCopy() {
    const ok = await copyAsHtml();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  /* ── Extract glossary handlers ── */
  async function handleExtract() {
    if (!extractText.trim()) return;
    setExtracting(true);
    setExtractError("");
    setExtractResult(null);
    try {
      const data = await extractGlossary({ text: extractText.trim() });
      setExtractResult(data);
    } catch (err) {
      setExtractError(err.message || "Failed to extract glossary.");
    } finally {
      setExtracting(false);
    }
  }

  const handleExtractCopy = useCallback(async () => {
    if (!extractResult || extractResult.terms.length === 0) return;
    const langLabel = language === "en" ? "Definition (English)" : "Definition (Danish)";
    const rows = extractResult.terms
      .map(
        (t) =>
          `<tr>` +
          `<td style="border:1px solid #ccc;padding:6px 10px;font-weight:bold;">${escapeHtml(t.term)}</td>` +
          `<td style="border:1px solid #ccc;padding:6px 10px;">${escapeHtml(t[language] || "")}</td>` +
          `</tr>`,
      )
      .join("");

    const html =
      `<table style="border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;">` +
      `<thead><tr>` +
      `<th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;">Term</th>` +
      `<th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;">${langLabel}</th>` +
      `</tr></thead>` +
      `<tbody>${rows}</tbody>` +
      `</table>`;

    const plain = [
      `Term\t${langLabel}`,
      ...extractResult.terms.map((t) => `${t.term}\t${t[language] || ""}`),
    ].join("\n");

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      setExtractCopied(true);
      setTimeout(() => setExtractCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  }, [extractResult, language]);

  function handleExtractClear() {
    setExtractText("");
    setExtractResult(null);
    setExtractError("");
  }

  const langLabel = language === "en" ? "Definition (English)" : "Definition (Danish)";

  return (
    <div className="home">
      <h1>{appConfig.name}</h1>
      <p>{appConfig.description}</p>

      {/* ── Controls row: search + language selector ── */}
      <div className="builder-controls">
        <div className="builder-search" ref={searchRef}>
          <input
            type="text"
            className="input"
            placeholder="Search and add terms..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setDropdownOpen(true)}
          />
          {searching && <span className="builder-search-spinner" />}

          {dropdownOpen && results.length > 0 && (
            <ul className="builder-dropdown">
              {results.map((term) => {
                const alreadyAdded = items.some((t) => t.id === term.id);
                return (
                  <li key={term.id}>
                    <button
                      className="builder-dropdown-item"
                      disabled={alreadyAdded}
                      onClick={() => handleSelectTerm(term)}
                    >
                      <span className="builder-dropdown-term">
                        {term.term}
                      </span>
                      {alreadyAdded && (
                        <span className="builder-dropdown-added">added</span>
                      )}
                      {!alreadyAdded &&
                        term.definitions &&
                        term.definitions.length > 0 && (
                          <span className="builder-dropdown-preview">
                            {term.definitions[0][language]
                              ? truncate(term.definitions[0][language], 60)
                              : ""}
                          </span>
                        )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {dropdownOpen && query.trim() && results.length === 0 && !searching && (
            <ul className="builder-dropdown">
              <li className="builder-dropdown-empty">No terms found.</li>
            </ul>
          )}
        </div>

        <select
          className="input builder-lang-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="da">Danish</option>
        </select>
      </div>

      {/* ── Glossary list table ── */}
      {items.length > 0 ? (
        <>
          <div className="builder-actions">
            <button className="btn btn-primary" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            <button className="btn btn-danger" onClick={clearList}>
              Clear list
            </button>
          </div>

          <table className="table builder-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>{langLabel}</th>
                <th className="builder-col-actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((term) => {
                const defs = term.definitions || [];
                const text = defs
                  .map((d) => d[language] || "")
                  .filter(Boolean)
                  .join("; ");

                return (
                  <tr key={term.id}>
                    <td className="builder-cell-term">{term.term}</td>
                    <td>{text || <span className="muted">No {language === "en" ? "English" : "Danish"} definition</span>}</td>
                    <td className="builder-cell-remove">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => removeTerm(term.id)}
                        title="Remove from list"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="empty">
          Search for terms above and add them to build your glossary list.
        </p>
      )}

      {/* ── Generate glossary from text ── */}
      <div className="extract-section">
        <button
          className="extract-toggle"
          onClick={() => setExtractOpen((v) => !v)}
        >
          <span className={`extract-toggle-arrow ${extractOpen ? "open" : ""}`}>&#9654;</span>
          Generate glossary from text
        </button>

        {extractOpen && (
          <div className="extract-body">
            <p className="extract-description">
              Paste or type text below and the AI will identify telecom terms
              and generate definitions in both English and Danish.
            </p>
            <textarea
              className="input extract-textarea"
              placeholder="Paste your text here..."
              value={extractText}
              onChange={(e) => setExtractText(e.target.value)}
              rows={6}
            />
            <div className="extract-actions">
              <button
                className="btn btn-primary"
                onClick={handleExtract}
                disabled={extracting || !extractText.trim()}
              >
                {extracting ? "Generating..." : "Generate glossary"}
              </button>
              {(extractText || extractResult) && (
                <button className="btn" onClick={handleExtractClear}>
                  Clear
                </button>
              )}
            </div>

            {extractError && (
              <p className="extract-error">{extractError}</p>
            )}

            {extractResult && extractResult.terms.length > 0 && (
              <>
                <div className="builder-actions">
                  <button className="btn btn-primary" onClick={handleExtractCopy}>
                    {extractCopied ? "Copied!" : "Copy to clipboard"}
                  </button>
                </div>
                <table className="table builder-table">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th>{langLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractResult.terms.map((t, i) => (
                      <tr key={i}>
                        <td className="builder-cell-term">{t.term}</td>
                        <td>{t[language] || <span className="muted">No {language === "en" ? "English" : "Danish"} definition</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
