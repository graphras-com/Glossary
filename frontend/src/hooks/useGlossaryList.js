/**
 * Session-scoped glossary list hook.
 *
 * Stores selected terms + definitions in React state (not persisted
 * beyond the browser session).  When the user changes language, the
 * displayed definition text switches automatically since full term
 * data (with both `en` and `da` fields) is kept in state.
 */

import { useState, useCallback } from "react";

/**
 * @returns {{ items, language, setLanguage, addTerm, removeTerm, clearList, copyAsHtml }}
 */
export default function useGlossaryList() {
  const [items, setItems] = useState([]); // full term objects from API
  const [language, setLanguage] = useState("en"); // "en" | "da"

  /** Add a term (with its definitions) to the list. Silently skips duplicates. */
  const addTerm = useCallback((term) => {
    setItems((prev) => {
      if (prev.some((t) => t.id === term.id)) return prev;
      return [...prev, term];
    });
  }, []);

  /** Remove a term by ID. */
  const removeTerm = useCallback((termId) => {
    setItems((prev) => prev.filter((t) => t.id !== termId));
  }, []);

  /** Clear the entire list. */
  const clearList = useCallback(() => setItems([]), []);

  /**
   * Build an HTML table string suitable for pasting into MS Word.
   * Uses inline styles so Word preserves formatting.
   */
  const buildHtmlTable = useCallback(() => {
    const langLabel = language === "en" ? "Definition (English)" : "Definition (Danish)";
    const rows = items
      .map((term) => {
        const defs = term.definitions || [];
        const text = defs
          .map((d) => d[language] || "")
          .filter(Boolean)
          .join("; ");
        return (
          `<tr>` +
          `<td style="border:1px solid #ccc;padding:6px 10px;font-weight:bold;">${escapeHtml(term.term)}</td>` +
          `<td style="border:1px solid #ccc;padding:6px 10px;">${escapeHtml(text)}</td>` +
          `</tr>`
        );
      })
      .join("");

    return (
      `<table style="border-collapse:collapse;width:100%;font-family:Calibri,Arial,sans-serif;font-size:11pt;">` +
      `<thead><tr>` +
      `<th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;">Term</th>` +
      `<th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;">${langLabel}</th>` +
      `</tr></thead>` +
      `<tbody>${rows}</tbody>` +
      `</table>`
    );
  }, [items, language]);

  /**
   * Copy the glossary list as an HTML table to the clipboard.
   * Returns true on success, false on failure.
   */
  const copyAsHtml = useCallback(async () => {
    if (items.length === 0) return false;
    const html = buildHtmlTable();
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob(
            [buildPlainText(items, language)],
            { type: "text/plain" },
          ),
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  }, [items, language, buildHtmlTable]);

  return { items, language, setLanguage, addTerm, removeTerm, clearList, copyAsHtml };
}

/** Escape HTML entities. */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text fallback for clipboard (tab-separated for spreadsheet paste). */
function buildPlainText(items, language) {
  const langLabel = language === "en" ? "Definition (English)" : "Definition (Danish)";
  const header = `Term\t${langLabel}`;
  const rows = items.map((term) => {
    const defs = term.definitions || [];
    const text = defs
      .map((d) => d[language] || "")
      .filter(Boolean)
      .join("; ");
    return `${term.term}\t${text}`;
  });
  return [header, ...rows].join("\n");
}
