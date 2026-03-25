import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import generateGlossaryPdf from "./generateGlossaryPdf.js";

/** Helper: build N terms spread across the alphabet (A-Z). */
function buildTerms(count) {
  const terms = [];
  for (let i = 0; i < count; i++) {
    const letter = String.fromCharCode(65 + (i % 26)); // A-Z
    const idx = Math.floor(i / 26);
    const name = `${letter}term${idx}`;
    terms.push({
      id: i + 1,
      term: name,
      definitions: [
        {
          id: i * 10,
          en: `English definition for ${name}. This is a reasonably long definition to simulate real content that wraps over multiple lines in the PDF layout.`,
          da: `Dansk definition for ${name}. Denne er rimelig lang for at simulere rigtigt indhold.`,
          category_id: "network",
        },
      ],
    });
  }
  return terms.sort((a, b) =>
    a.term.localeCompare(b.term, undefined, { sensitivity: "base" }),
  );
}

/** Simple breadcrumb stub. */
function breadcrumb(categoryId) {
  return categoryId || "Uncategorised";
}

/**
 * Wrap the jsPDF constructor so that every instance created has its .text()
 * method intercepted.  This captures text calls made by generateGlossaryPdf.
 */
function createSpyFactory(calls) {
  return function SpyJsPDF(opts) {
    const instance = new jsPDF(opts);
    const origText = instance.text.bind(instance);
    instance.text = function (...args) {
      const t = args[0];
      if (Array.isArray(t)) {
        calls.push(...t);
      } else {
        calls.push(String(t));
      }
      return origText(...args);
    };
    return instance;
  };
}

/**
 * Like createSpyFactory but also records which page number each text call
 * lands on.  Returns an array of { text, page } objects.
 */
function createPageTrackingFactory(entries) {
  return function SpyJsPDF(opts) {
    const instance = new jsPDF(opts);
    let currentPage = 1;

    const origAddPage = instance.addPage.bind(instance);
    instance.addPage = function (...args) {
      const result = origAddPage(...args);
      currentPage++;
      return result;
    };

    const origText = instance.text.bind(instance);
    instance.text = function (...args) {
      const t = args[0];
      if (Array.isArray(t)) {
        t.forEach((s) => entries.push({ text: s, page: currentPage }));
      } else {
        entries.push({ text: String(t), page: currentPage });
      }
      return origText(...args);
    };
    return instance;
  };
}

describe("generateGlossaryPdf", () => {
  it("returns an object with save and internal methods", () => {
    const doc = generateGlossaryPdf(jsPDF, [], breadcrumb);
    expect(doc).toBeDefined();
    expect(typeof doc.save).toBe("function");
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("renders the title and term count", () => {
    const terms = buildTerms(3);
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    expect(calls.some((c) => c.includes("Glossary"))).toBe(true);
    expect(calls.some((c) => c.includes("3 terms"))).toBe(true);
  });

  it("includes every term name for a small list", () => {
    const terms = [
      { id: 1, term: "Alpha", definitions: [{ id: 10, en: "First", da: null, category_id: "c" }] },
      { id: 2, term: "Beta", definitions: [{ id: 20, en: "Second", da: "Anden", category_id: "c" }] },
      { id: 3, term: "Zeta", definitions: [{ id: 30, en: "Last", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    expect(calls).toContain("Alpha");
    expect(calls).toContain("Beta");
    expect(calls).toContain("Zeta");
  });

  it("includes all 130 terms (reproduces the truncation bug)", () => {
    const terms = buildTerms(130);
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // Every single term name must appear in the text output
    for (const term of terms) {
      expect(calls, `Missing term: ${term.term}`).toContain(term.term);
    }
  });

  it("includes all 260 terms (stress test with 10 full A-Z cycles)", () => {
    const terms = buildTerms(260);
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    for (const term of terms) {
      expect(calls, `Missing term: ${term.term}`).toContain(term.term);
    }
  });

  it("creates multiple pages for large term sets", () => {
    const terms = buildTerms(130);
    const doc = generateGlossaryPdf(jsPDF, terms, breadcrumb);
    // 130 terms with definitions should not fit on a single A4 page
    const pageCount = doc.internal.getNumberOfPages();
    expect(pageCount).toBeGreaterThan(1);
  });

  it("renders letter headings for each unique first letter", () => {
    const terms = [
      { id: 1, term: "Apple", definitions: [{ id: 10, en: "A fruit", da: null, category_id: "c" }] },
      { id: 2, term: "Avocado", definitions: [{ id: 20, en: "Also a fruit", da: null, category_id: "c" }] },
      { id: 3, term: "Banana", definitions: [{ id: 30, en: "Yellow fruit", da: null, category_id: "c" }] },
      { id: 4, term: "Cherry", definitions: [{ id: 40, en: "Red fruit", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    // Each letter appears twice: once in the TOC and once as a section heading
    expect(calls.filter((c) => c === "A").length).toBe(2);
    expect(calls.filter((c) => c === "B").length).toBe(2);
    expect(calls.filter((c) => c === "C").length).toBe(2);
  });

  it("handles terms with no definitions", () => {
    const terms = [
      { id: 1, term: "Empty", definitions: [] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    expect(calls).toContain("Empty");
    expect(calls).toContain("No definitions.");
  });

  it("handles terms with multiple definitions", () => {
    const terms = [
      {
        id: 1,
        term: "Multi",
        definitions: [
          { id: 10, en: "First meaning", da: "Forste", category_id: "c1" },
          { id: 11, en: "Second meaning", da: null, category_id: "c2" },
        ],
      },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    // Numbered prefixes should appear
    expect(calls.some((c) => c.includes("1. First meaning"))).toBe(true);
    expect(calls.some((c) => c.includes("2. Second meaning"))).toBe(true);
  });

  it("renders Danish definitions when present", () => {
    const terms = [
      {
        id: 1,
        term: "Bilingual",
        definitions: [
          { id: 10, en: "In English", da: "Pa dansk", category_id: "c" },
        ],
      },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);
    expect(calls.some((c) => c.includes("Pa dansk"))).toBe(true);
  });

  it("renders category breadcrumbs", () => {
    const terms = [
      {
        id: 1,
        term: "CatTest",
        definitions: [
          { id: 10, en: "Def", da: null, category_id: "network.mobile" },
        ],
      },
    ];
    const customBreadcrumb = (id) =>
      id === "network.mobile" ? "Network \u00BB Mobile" : id;
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, customBreadcrumb);
    expect(calls).toContain("Network \u00BB Mobile");
  });

  it("groups all digit-leading terms under a single 0-9 heading", () => {
    const terms = [
      { id: 1, term: "3GPP", definitions: [{ id: 10, en: "3rd Generation Partnership Project", da: null, category_id: "c" }] },
      { id: 2, term: "4G", definitions: [{ id: 20, en: "Fourth generation mobile", da: null, category_id: "c" }] },
      { id: 3, term: "5G", definitions: [{ id: 30, en: "Fifth generation mobile", da: null, category_id: "c" }] },
      { id: 4, term: "100GbE", definitions: [{ id: 40, en: "100 Gigabit Ethernet", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // Single "0-9" heading (once in TOC, once as section heading), not individual "1", "3", "4", "5"
    expect(calls.filter((c) => c === "0-9").length).toBe(2);
    expect(calls).not.toContain("3");
    expect(calls).not.toContain("4");
    expect(calls).not.toContain("5");
    expect(calls).not.toContain("1");

    // All term names still present
    expect(calls).toContain("3GPP");
    expect(calls).toContain("4G");
    expect(calls).toContain("5G");
    expect(calls).toContain("100GbE");
  });

  it("renders 0-9 heading before letter headings when digits come first", () => {
    const terms = [
      { id: 1, term: "2B1Q", definitions: [{ id: 10, en: "Two binary one quaternary", da: null, category_id: "c" }] },
      { id: 2, term: "Alpha", definitions: [{ id: 20, en: "First letter", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    const idx09 = calls.indexOf("0-9");
    const idxA = calls.indexOf("A");
    expect(idx09).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeGreaterThan(idx09);
  });

  it("does not render 0-9 heading when no digit-leading terms exist", () => {
    const terms = [
      { id: 1, term: "Alpha", definitions: [{ id: 10, en: "A word", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    expect(calls).not.toContain("0-9");
  });

  it("does not split a term block across pages", () => {
    // Build enough short terms under "A" to fill most of page 1, then a
    // larger term under "B" that would be split by the old piece-by-piece
    // ensureSpace approach.
    const terms = [];
    // ~12 short A-terms should consume most of a page (~22mm each)
    for (let i = 0; i < 12; i++) {
      terms.push({
        id: i + 1,
        term: `Alpha${String(i).padStart(2, "0")}`,
        definitions: [
          { id: i * 10, en: `Short definition ${i}.`, da: null, category_id: "c" },
        ],
      });
    }
    // One larger term with a long EN + DA definition that takes ~40-50mm
    terms.push({
      id: 100,
      term: "Bravo",
      definitions: [
        {
          id: 1000,
          en: "This is a very long English definition that is meant to produce several wrapped lines in the PDF. It continues with more and more text to ensure it occupies a significant vertical block. The purpose is to verify that this entire block, including the term name, English text, Danish text, and category breadcrumb, all appear on the same page without being split across a page boundary.",
          da: "Dette er en lang dansk definition der skal producere flere linjer i PDF-dokumentet. Den fortsetter med mere tekst for at sikre at den fylder en betydelig vertikal blok.",
          category_id: "c",
        },
      ],
    });

    const entries = [];
    const factory = createPageTrackingFactory(entries);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // Find the page where "Bravo" (term name) was rendered
    const bravoEntry = entries.find((e) => e.text === "Bravo");
    expect(bravoEntry, "Bravo term name should appear in the PDF").toBeDefined();
    const bravoPage = bravoEntry.page;

    // Every text entry that belongs to the Bravo block must be on the same page.
    // The block includes: the term name, all definition text lines, the DA text,
    // and the breadcrumb. We identify them by looking at entries between "Bravo"
    // and the next separator / next term name.
    const bravoIdx = entries.indexOf(bravoEntry);
    for (let i = bravoIdx + 1; i < entries.length; i++) {
      const e = entries[i];
      // Stop when we hit the next term name (Alpha* or any other term heading)
      // or a letter heading like "C". The Bravo block's content is definitions
      // and breadcrumbs which won't match a term name pattern.
      if (/^Alpha\d+$/.test(e.text) || /^[A-Z]$/.test(e.text)) break;
      expect(
        e.page,
        `"${e.text}" should be on the same page (${bravoPage}) as "Bravo" but was on page ${e.page}`,
      ).toBe(bravoPage);
    }
  });

  it("keeps letter heading and first term together on the same page", () => {
    // Fill most of page 1 with A-terms, then the "B" heading + first B-term
    // should land together (not heading on page 1, term on page 2).
    const terms = [];
    for (let i = 0; i < 12; i++) {
      terms.push({
        id: i + 1,
        term: `Alpha${String(i).padStart(2, "0")}`,
        definitions: [
          { id: i * 10, en: `Short definition ${i}.`, da: null, category_id: "c" },
        ],
      });
    }
    terms.push({
      id: 100,
      term: "Bravo",
      definitions: [
        { id: 1000, en: "First B-term definition.", da: "Forste B definition.", category_id: "c" },
      ],
    });

    const entries = [];
    const factory = createPageTrackingFactory(entries);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // "B" appears twice: first in the TOC (page 1), then as a section heading.
    // Find the section heading (last occurrence) to check co-location with "Bravo".
    const bEntries = entries.filter((e) => e.text === "B");
    const headingEntry = bEntries[bEntries.length - 1]; // section heading
    const bravoEntry = entries.find((e) => e.text === "Bravo");
    expect(headingEntry).toBeDefined();
    expect(bravoEntry).toBeDefined();
    expect(
      headingEntry.page,
      `Letter heading "B" (page ${headingEntry.page}) should be on the same page as "Bravo" (page ${bravoEntry.page})`,
    ).toBe(bravoEntry.page);
  });

  it("handles an empty term list without crashing", () => {
    const doc = generateGlossaryPdf(jsPDF, [], breadcrumb);
    expect(doc).toBeDefined();
    expect(typeof doc.save).toBe("function");
    expect(doc.internal.getNumberOfPages()).toBe(1);
  });

  it("renders a horizontal TOC with all unique first letters", () => {
    const terms = [
      { id: 1, term: "Apple", definitions: [{ id: 10, en: "A fruit", da: null, category_id: "c" }] },
      { id: 2, term: "Banana", definitions: [{ id: 20, en: "B fruit", da: null, category_id: "c" }] },
      { id: 3, term: "Cherry", definitions: [{ id: 30, en: "C fruit", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // The TOC letters appear before the section headings.
    // Find the first occurrence of each letter (TOC) and confirm they come
    // before "Apple" (the first term name).
    const firstA = calls.indexOf("A");
    const firstB = calls.indexOf("B");
    const firstC = calls.indexOf("C");
    const appleIdx = calls.indexOf("Apple");
    expect(firstA).toBeLessThan(appleIdx);
    expect(firstB).toBeLessThan(appleIdx);
    expect(firstC).toBeLessThan(appleIdx);
  });

  it("renders bullet separators between TOC entries", () => {
    const terms = [
      { id: 1, term: "Alpha", definitions: [{ id: 10, en: "Def", da: null, category_id: "c" }] },
      { id: 2, term: "Beta", definitions: [{ id: 20, en: "Def", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // There should be a bullet separator " \u2022 " between the TOC entries
    expect(calls.some((c) => c.includes("\u2022") && c.includes(" "))).toBe(true);
  });

  it("does not render a TOC when there are no terms", () => {
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, [], breadcrumb);

    // No letter should appear since there are no terms (and thus no TOC)
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      expect(calls).not.toContain(letter);
    }
    expect(calls).not.toContain("0-9");
  });

  it("TOC includes 0-9 when digit-leading terms exist", () => {
    const terms = [
      { id: 1, term: "3GPP", definitions: [{ id: 10, en: "Standard", da: null, category_id: "c" }] },
      { id: 2, term: "Alpha", definitions: [{ id: 20, en: "Def", da: null, category_id: "c" }] },
    ];
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // "0-9" appears twice: once in TOC, once as section heading
    expect(calls.filter((c) => c === "0-9").length).toBe(2);
    // First "0-9" (TOC) comes before "3GPP" (first term)
    const first09 = calls.indexOf("0-9");
    const gppIdx = calls.indexOf("3GPP");
    expect(first09).toBeLessThan(gppIdx);
  });

  it("all terms from A through Z are present in a full-alphabet set", () => {
    // One term per letter, A-Z
    const terms = [];
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      terms.push({
        id: i + 1,
        term: `${letter}word`,
        definitions: [
          { id: i * 10, en: `Definition for ${letter}word`, da: null, category_id: "c" },
        ],
      });
    }
    const calls = [];
    const factory = createSpyFactory(calls);
    generateGlossaryPdf(factory, terms, breadcrumb);

    // Verify every letter heading and every term name
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      expect(calls, `Missing letter heading: ${letter}`).toContain(letter);
      expect(calls, `Missing term: ${letter}word`).toContain(`${letter}word`);
    }
  });
});
