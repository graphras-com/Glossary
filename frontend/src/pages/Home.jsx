/**
 * Home page — term lookup, glossary list builder, and text-based extraction.
 *
 * Users search for terms, add them to a session-scoped glossary list,
 * choose a language (English or Danish), and copy the list as an HTML
 * table that pastes cleanly into MS Word.
 *
 * The "Generate glossary from text" section lets users paste free text;
 * the backend matches it against existing glossary terms and adds the
 * matches to the same shared glossary list.
 */

import { useState, useEffect, useRef } from "react";
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
  const [extractCount, setExtractCount] = useState(null);

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

  /* ── Extract glossary handler ── */
  async function handleExtract() {
    if (!extractText.trim()) return;
    setExtracting(true);
    setExtractError("");
    setExtractCount(null);
    try {
      const data = await extractGlossary({ text: extractText.trim() });
      if (data.length === 0) {
        setExtractError("No matching glossary terms found in the text.");
      } else {
        let added = 0;
        for (const term of data) {
          if (!items.some((t) => t.id === term.id)) {
            addTerm(term);
            added++;
          }
        }
        setExtractCount({ total: data.length, added });
      }
    } catch (err) {
      setExtractError(err.message || "Failed to extract glossary.");
    } finally {
      setExtracting(false);
    }
  }

  /** Build definition text for a term. */
  function defText(term) {
    const defs = term.definitions || [];
    return defs
      .map((d) => d[language] || "")
      .filter(Boolean)
      .join("; ");
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
              Paste or type text below to find matching glossary terms and
              add them to your list.
            </p>
            <textarea
              className="input extract-textarea"
              placeholder="Paste your text here..."
              value={extractText}
              onChange={(e) => {
                setExtractText(e.target.value);
                setExtractCount(null);
                setExtractError("");
              }}
              rows={6}
            />
            <div className="extract-actions">
              <button
                className="btn btn-primary"
                onClick={handleExtract}
                disabled={extracting || !extractText.trim()}
              >
                {extracting ? "Searching..." : "Generate glossary"}
              </button>
              {extractText && (
                <button
                  className="btn"
                  onClick={() => {
                    setExtractText("");
                    setExtractError("");
                    setExtractCount(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {extractError && (
              <p className="extract-error">{extractError}</p>
            )}

            {extractCount !== null && (
              <p className="extract-success">
                Found {extractCount.total} {extractCount.total === 1 ? "term" : "terms"}
                {extractCount.added < extractCount.total
                  ? ` (${extractCount.added} new, ${extractCount.total - extractCount.added} already in list)`
                  : ""}.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Glossary list table ── */}
      {items.length > 0 ? (
        <>
          <hr className="builder-divider" />

          <table className="table builder-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>{langLabel}</th>
                <th className="builder-col-actions">
                  <div className="builder-header-actions">
                    <button className="btn btn-sm btn-primary" onClick={handleCopy}>
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={clearList}>
                      Clear list
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((term) => {
                const text = defText(term);
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
          Search for terms above or generate from text to build your glossary list.
        </p>
      )}
    </div>
  );
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}
