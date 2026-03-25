/**
 * Generate a multi-page A4 PDF of all glossary terms.
 *
 * Accepts a jsPDF constructor so callers can dynamically import the library
 * and tests can inject a mock/real instance.
 *
 * @param {Function} jsPDF        – the jsPDF class (default export from "jspdf")
 * @param {Array}    sortedTerms  – terms sorted alphabetically, each with .term and .definitions[]
 * @param {Function} categoryBreadcrumb – (categoryId) => "Parent >> Child" label string
 * @returns {import("jspdf").jsPDF} the finished jsPDF document
 */
export default function generateGlossaryPdf(
  jsPDF,
  sortedTerms,
  categoryBreadcrumb,
) {
  const pageWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 20; // reserve space at bottom of each page

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = margin;

  /**
   * Measure the total height a term block will occupy without drawing.
   * This sets fonts/sizes on the doc to get accurate splitTextToSize results
   * but does not call doc.text() or doc.line().
   */
  function measureTermBlock(term) {
    let h = 0;

    // Term name
    h += 6;

    if (term.definitions.length === 0) {
      h += 5;
    } else {
      term.definitions.forEach((def, i) => {
        const prefix = term.definitions.length > 1 ? `${i + 1}. ` : "";

        // English
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        const enLines = doc.splitTextToSize(
          `${prefix}${def.en}`,
          contentWidth - 6,
        );
        h += enLines.length * 4.2;

        // Danish
        if (def.da) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(9);
          const daLines = doc.splitTextToSize(def.da, contentWidth - 6);
          h += daLines.length * 4;
        }

        // Category breadcrumb
        h += 5;
      });
    }

    // Separator line spacing
    h += 1 + 5;

    return h;
  }

  // ── Title ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Telecom Glossary", pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${sortedTerms.length} terms \u2022 Generated ${new Date().toLocaleDateString()}`,
    pageWidth / 2,
    y,
    { align: "center" },
  );
  doc.setTextColor(0);
  y += 10;

  // ── Horizontal TOC ──
  // Collect unique first-letter groups from the sorted terms.
  const letterSet = new Set();
  for (const t of sortedTerms) {
    const ch = t.term[0].toUpperCase();
    letterSet.add(/\d/.test(ch) ? "0-9" : ch);
  }
  const letters = Array.from(letterSet);

  // tocClickZones stores { letter, x, y, w, h } for each TOC entry so we
  // can attach internal links after we know where each heading lands.
  const tocClickZones = [];
  // letterTargets stores { letter: { page, top } } filled during rendering.
  const letterTargets = {};

  if (letters.length > 0) {
    const tocFontSize = 9;
    const dotSep = " \u2022 "; // " • "
    doc.setFont("helvetica", "bold");
    doc.setFontSize(tocFontSize);

    // Measure total width to centre the line
    const widths = {};
    for (const letter of letters) {
      const w = doc.getTextWidth(letter);
      widths[letter] = w;
    }
    const sepWidth = doc.getTextWidth(dotSep);

    // Wrap into multiple rows if the TOC is wider than the content area
    const rows = [];
    let row = [];
    let rowWidth = 0;
    for (let i = 0; i < letters.length; i++) {
      const entryWidth =
        widths[letters[i]] + (row.length > 0 ? sepWidth : 0);
      if (row.length > 0 && rowWidth + entryWidth > contentWidth) {
        rows.push(row);
        row = [letters[i]];
        rowWidth = widths[letters[i]];
      } else {
        row.push(letters[i]);
        rowWidth += entryWidth;
      }
    }
    if (row.length > 0) rows.push(row);

    const tocLineHeight = 5.5;
    for (const tocRow of rows) {
      // Compute row width to centre it
      let rw = 0;
      for (let i = 0; i < tocRow.length; i++) {
        rw += widths[tocRow[i]];
        if (i > 0) rw += sepWidth;
      }
      let cx = (pageWidth - rw) / 2;

      for (let i = 0; i < tocRow.length; i++) {
        if (i > 0) {
          // Draw the bullet separator (non-clickable)
          doc.setTextColor(150);
          doc.text(dotSep, cx, y);
          cx += sepWidth;
        }
        // Draw the letter in blue
        doc.setTextColor(37, 99, 235);
        doc.text(tocRow[i], cx, y);
        // Record click zone (x, baseline-adjusted y, width, height)
        tocClickZones.push({
          letter: tocRow[i],
          x: cx,
          y: y - tocFontSize * 0.35, // shift up from baseline
          w: widths[tocRow[i]],
          h: tocLineHeight,
        });
        cx += widths[tocRow[i]];
      }
      y += tocLineHeight;
    }

    doc.setTextColor(0);
    y += 3;
  }

  // ── Divider ──
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Terms ──
  let currentLetter = "";

  for (const term of sortedTerms) {
    const ch = term.term[0].toUpperCase();
    const firstLetter = /\d/.test(ch) ? "0-9" : ch;

    // Measure the full term block so we can avoid splitting it across pages
    const blockHeight = measureTermBlock(term);

    // Letter heading
    const needsHeading = firstLetter !== currentLetter;
    const headingHeight = needsHeading ? 12 : 0; // heading + underline + gaps
    const extraGap = needsHeading && y > margin + 10 ? 4 : 0;
    const totalNeeded = headingHeight + extraGap + blockHeight;

    // If the entire block (heading + term) fits on a new page but not the
    // current one, start a new page. If the block is taller than a full page
    // we still start it at the top of a new page (it will overflow but at
    // least it starts cleanly).
    if (y + totalNeeded > pageHeight - bottomMargin && y > margin) {
      doc.addPage();
      y = margin;
    }

    if (needsHeading) {
      currentLetter = firstLetter;
      if (y > margin + 10) y += 4;

      // Record target position for TOC links (page number + y offset)
      letterTargets[currentLetter] = {
        page: doc.internal.getNumberOfPages(),
        top: y - 5, // small offset above the heading text
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(37, 99, 235);
      doc.text(currentLetter, margin, y);
      y += 2;
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.4);
      doc.line(margin, y, margin + 12, y);
      doc.setDrawColor(200);
      y += 6;
      doc.setTextColor(0);
    }

    // Term name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(term.term, margin, y);
    y += 6;

    // Definitions
    if (term.definitions.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text("No definitions.", margin + 3, y);
      y += 5;
    } else {
      term.definitions.forEach((def, i) => {
        const prefix = term.definitions.length > 1 ? `${i + 1}. ` : "";

        // English
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(40);
        const enText = `${prefix}${def.en}`;
        const enLines = doc.splitTextToSize(enText, contentWidth - 6);
        doc.text(enLines, margin + 3, y);
        y += enLines.length * 4.2;

        // Danish
        if (def.da) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(9);
          doc.setTextColor(100);
          const daLines = doc.splitTextToSize(def.da, contentWidth - 6);
          doc.text(daLines, margin + 3, y);
          y += daLines.length * 4;
        }

        // Category breadcrumb
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(37, 99, 235);
        doc.text(categoryBreadcrumb(def.category_id), margin + 3, y);
        doc.setTextColor(0);
        y += 5;
      });
    }

    // Subtle separator between terms
    y += 1;
    doc.setDrawColor(225);
    doc.setLineWidth(0.15);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  // ── Attach internal links from TOC entries to letter headings ──
  for (const zone of tocClickZones) {
    const target = letterTargets[zone.letter];
    if (target) {
      // link() must be called in the context of the page where the link lives
      doc.setPage(1);
      doc.link(zone.x, zone.y, zone.w, zone.h, {
        pageNumber: target.page,
        top: target.top,
      });
    }
  }

  return doc;
}
