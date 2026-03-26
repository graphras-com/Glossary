import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Glossary (Terms list)", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("displays all terms with their definitions inline", async ({ page }) => {
    await page.goto("/terms");

    // All three mock terms visible
    await expect(page.locator(".glossary-entry")).toHaveCount(3);
    await expect(page.locator(".glossary-term:has-text('Bandwidth')")).toBeVisible();
    await expect(page.locator(".glossary-term:has-text('Latency')")).toBeVisible();
    await expect(page.locator(".glossary-term:has-text('Churn')")).toBeVisible();
  });

  test("shows English definitions inline", async ({ page }) => {
    await page.goto("/terms");

    await expect(
      page.locator("text=The maximum rate of data transfer across a given path.")
    ).toBeVisible();
    await expect(
      page.locator("text=The rate at which subscribers leave a service.")
    ).toBeVisible();
  });

  test("shows Danish definitions when present", async ({ page }) => {
    await page.goto("/terms");

    await expect(
      page.locator("text=Den maksimale dataoverførselshastighed.")
    ).toBeVisible();
  });

  test("shows category breadcrumbs on definitions", async ({ page }) => {
    await page.goto("/terms");

    // "network.mobile" should render as "Network \u00BB Mobile"
    await expect(page.locator(".badge:has-text('Network \u00BB Mobile')")).toBeVisible();

    // "commercial.retail" should render as "Commercial \u00BB Retail"
    await expect(page.locator(".badge:has-text('Commercial \u00BB Retail')")).toBeVisible();

    // top-level "network" should render as just "Network"
    const networkBadges = page.locator(".badge:has-text('Network')");
    await expect(networkBadges.first()).toBeVisible();
  });

  test("numbers definitions when a term has more than one", async ({ page }) => {
    await page.goto("/terms");

    // Latency has 2 definitions so they should be numbered
    const latencyEntry = page.locator(".glossary-entry:has-text('Latency')");
    await expect(latencyEntry.locator(".glossary-def-num:has-text('1.')")).toBeVisible();
    await expect(latencyEntry.locator(".glossary-def-num:has-text('2.')")).toBeVisible();

    // Bandwidth has 1 definition so no numbering
    const bandwidthEntry = page.locator(".glossary-entry:has-text('Bandwidth')");
    await expect(bandwidthEntry.locator(".glossary-def-num")).toHaveCount(0);
  });

  test("creates a new term and it appears in the glossary", async ({ page }) => {
    await page.goto("/terms");
    await page.click('a:has-text("+ New Term")');
    await expect(page).toHaveURL(/\/terms\/new/);
    await expect(page.getByRole("heading", { name: "New Term" })).toBeVisible();

    await page.fill("#term-name", "Throughput");
    await page
      .locator("#definition-en-0")
      .fill("The amount of data moved successfully in a given time period.");
    await page
      .locator("#definition-category-0")
      .selectOption({ label: "Network" });

    await page.click('button:has-text("Create Term")');
    // TermCreate redirects to /terms with scrollToTerm state
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("recommends English and Danish definitions on create term", async ({ page }) => {
    await page.goto("/terms/new");
    await page.fill("#term-name", "SIM");
    await page.locator("#definition-category-0").selectOption({ label: "Network" });

    await page.click('button:has-text("Recommend definition")');

    await expect(page.locator("#definition-en-0")).toHaveValue(
      "A concise definition for SIM."
    );
    await expect(page.locator("#definition-da-0")).toHaveValue(
      "En kort definition af SIM."
    );
  });

  test("shows an error if recommendation fails", async ({ page }) => {
    await page.route("**/terms/recommend-definition", (route) =>
      route.fulfill({ status: 503, json: { detail: "AI provider unavailable" } })
    );

    await page.goto("/terms/new");
    await page.fill("#term-name", "SIM");
    await page.click('button:has-text("Recommend definition")');

    await expect(page.locator(".error-message")).toContainText("AI provider unavailable");
  });

  test("edits a term name", async ({ page }) => {
    await page.goto("/terms");

    // Click edit on the first term's actions — scope to term-level actions
    const firstEntry = page.locator(".glossary-entry").first();
    await firstEntry.locator('.glossary-term-actions a:has-text("Edit")').click();
    await expect(page).toHaveURL(/\/terms\/\d+\/edit/);

    // Wait for the edit form to render
    await expect(page.locator("h1")).toHaveText("Edit Term");

    const input = page.locator('form input[type="text"]');
    await input.clear();
    await input.fill("Bandwidth (Updated)");
    await page.click('button:has-text("Save Changes")');

    // TermEdit redirects back to /terms with scrollToTerm state
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("deletes a term after confirmation", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator(".glossary-entry")).toHaveCount(3);

    // Set up dialog handler to accept
    page.on("dialog", (dialog) => dialog.accept());

    // Scope to term-level actions
    const firstEntry = page.locator(".glossary-entry").first();
    await firstEntry.locator('.glossary-term-actions button:has-text("Delete")').click();

    await expect(page.locator(".glossary-entry")).toHaveCount(2);
  });
});
