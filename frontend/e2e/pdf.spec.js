import { test, expect } from "@playwright/test";
import { mockApi, CATEGORIES } from "./helpers.js";
import fs from "fs";

test.describe("PDF download", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("download PDF button is visible and triggers a download", async ({ page }) => {
    await page.goto("/terms");

    const downloadBtn = page.locator('button:has-text("Download PDF")');
    await expect(downloadBtn).toBeVisible();

    // Listen for the download event
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toBe("glossary.pdf");
  });

  test("download PDF button is hidden when no terms", async ({ page }) => {
    await page.goto("/terms");
    await page.fill('input[placeholder="Search terms..."]', "xyznonexistent");
    await expect(page.locator(".glossary-entry")).toHaveCount(0);
    await expect(page.locator('button:has-text("Download PDF")')).toBeHidden();
  });

  test("PDF contains all terms including those from A through Z", async ({ page }) => {
    // Create terms covering every letter A-Z so we can verify none are truncated
    const aToZTerms = [];
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      aToZTerms.push({
        id: 1000 + i,
        term: `${letter}testword`,
        definitions: [
          {
            id: 5000 + i,
            en: `English definition for ${letter}testword that is long enough to occupy space.`,
            da: `Dansk definition for ${letter}testword.`,
            category_id: "network",
          },
        ],
      });
    }

    // Override the /terms route to return our A-Z terms
    await page.route(/localhost:(5173|8000)/, async (route) => {
      const accept = route.request().headers()["accept"] || "";
      if (accept.includes("text/html")) {
        return route.fallback();
      }
      const url = route.request().url();
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/\/$/, "");

      if (pathname === "/terms" && route.request().method() === "GET") {
        return route.fulfill({ json: aToZTerms });
      }
      if (pathname === "/categories" && route.request().method() === "GET") {
        return route.fulfill({ json: CATEGORIES });
      }
      return route.fallback();
    });

    await page.goto("/terms");
    await page.waitForSelector('button:has-text("Download PDF")');

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('button:has-text("Download PDF")').click(),
    ]);

    expect(download.suggestedFilename()).toBe("glossary.pdf");

    // Save the PDF and check it is non-trivially sized
    const path = await download.path();
    const pdfBuffer = fs.readFileSync(path);

    // A PDF with 26 terms should be well over 1KB
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Check the raw PDF content for term presence.
    // jsPDF embeds text as literal strings in the PDF stream.
    // We can search for them in the raw bytes.
    const pdfText = pdfBuffer.toString("latin1");

    // Verify every letter's term appears somewhere in the PDF file
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      const termName = `${letter}testword`;
      expect(
        pdfText.includes(termName),
        `PDF should contain term "${termName}" but it was not found`,
      ).toBe(true);
    }
  });

  test("PDF has multiple pages for many terms", async ({ page }) => {
    // Generate 50 terms with long definitions to force multi-page
    const manyTerms = [];
    for (let i = 0; i < 50; i++) {
      const letter = String.fromCharCode(65 + (i % 26));
      const idx = Math.floor(i / 26);
      manyTerms.push({
        id: 2000 + i,
        term: `${letter}glossary${idx}`,
        definitions: [
          {
            id: 6000 + i,
            en: `This is a detailed English definition for ${letter}glossary${idx}. It contains enough text to take up a reasonable amount of vertical space in the generated PDF document.`,
            da: `Dette er en detaljeret dansk definition for ${letter}glossary${idx}. Den indeholder nok tekst til at optage en rimelig plads.`,
            category_id: "network",
          },
        ],
      });
    }

    await page.route(/localhost:(5173|8000)/, async (route) => {
      const accept = route.request().headers()["accept"] || "";
      if (accept.includes("text/html")) {
        return route.fallback();
      }
      const url = route.request().url();
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/\/$/, "");

      if (pathname === "/terms" && route.request().method() === "GET") {
        return route.fulfill({ json: manyTerms });
      }
      if (pathname === "/categories" && route.request().method() === "GET") {
        return route.fulfill({ json: CATEGORIES });
      }
      return route.fallback();
    });

    await page.goto("/terms");
    await page.waitForSelector('button:has-text("Download PDF")');

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator('button:has-text("Download PDF")').click(),
    ]);

    const path = await download.path();
    const pdfBuffer = fs.readFileSync(path);
    const pdfText = pdfBuffer.toString("latin1");

    // Verify the last term in sorted order is present (would have been truncated before the fix)
    const lastTerm = [...manyTerms]
      .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }))
      .at(-1);
    expect(
      pdfText.includes(lastTerm.term),
      `PDF should contain the last term "${lastTerm.term}"`,
    ).toBe(true);

    // Verify all terms are present
    for (const t of manyTerms) {
      expect(
        pdfText.includes(t.term),
        `PDF should contain term "${t.term}"`,
      ).toBe(true);
    }
  });
});
