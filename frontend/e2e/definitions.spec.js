import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Definitions CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("adds a new definition and redirects to term list scrolled to the term", async ({ page }) => {
    await page.goto("/terms");

    // Click "+ Definition" on Bandwidth (scoped to term-level actions)
    const bandwidthEntry = page.locator(".glossary-entry:has-text('Bandwidth')");
    await bandwidthEntry.locator('.glossary-term-actions a:has-text("+ Definition")').click();
    await expect(page).toHaveURL(/\/terms\/\d+\/definitions\/new/);

    // Should show term name in heading
    await expect(page.locator("h1")).toContainText("Bandwidth");

    // Fill in new definition
    const enTextarea = page.locator(".form-group").filter({ hasText: "English" }).locator("textarea");
    await enTextarea.fill("The capacity of a network link.");
    const daTextarea = page.locator(".form-group").filter({ hasText: "Danish" }).locator("textarea");
    await daTextarea.fill("Kapaciteten af en netværksforbindelse.");
    await page.selectOption("select", { label: "Transmission" });

    await page.click('button:has-text("Create Definition")');
    // Should redirect to the term list
    await expect(page).toHaveURL("/terms");
    // The term entry should be visible
    await expect(page.locator("#term-1")).toBeVisible();
  });

  test("edits a definition and redirects to term list scrolled to the term", async ({ page }) => {
    // Navigate to Bandwidth's detail page (term id 1)
    await page.goto("/terms/1");

    // Click edit on the definition (only one definition card, so only one Edit link)
    await page.locator('.card a:has-text("Edit")').click();
    await expect(page).toHaveURL(/\/terms\/1\/definitions\/\d+\/edit/);

    const enTextarea = page.locator(".form-group").filter({ hasText: "English" }).locator("textarea");
    await enTextarea.clear();
    await enTextarea.fill("Updated bandwidth definition.");

    await page.click('button:has-text("Save Changes")');
    // Should redirect to the term list
    await expect(page).toHaveURL("/terms");
    // The term entry should be visible (scrolled into view)
    await expect(page.locator("#term-1")).toBeVisible();
  });

  test("category dropdown shows breadcrumb labels in create form", async ({ page }) => {
    await page.goto("/terms");

    // Click "+ Definition" on Bandwidth
    const bandwidthEntry = page.locator(".glossary-entry:has-text('Bandwidth')");
    await bandwidthEntry.locator('.glossary-term-actions a:has-text("+ Definition")').click();

    // Child categories should show full breadcrumb with \u00BB separator
    const select = page.locator("select");
    await expect(select.locator("option:has-text('Network \u00BB Mobile')")).toBeAttached();
    await expect(select.locator("option:has-text('Commercial \u00BB Retail')")).toBeAttached();
    await expect(select.locator("option:has-text('Transmission \u00BB Submarine Cable')")).toBeAttached();

    // Can select a breadcrumb option
    await select.selectOption({ label: "Network \u00BB Mobile" });
    await expect(select).toHaveValue("network.mobile");
  });

  test("category dropdown shows breadcrumb labels in edit form", async ({ page }) => {
    await page.goto("/terms/1");

    await page.locator('.card a:has-text("Edit")').click();

    // Child categories should show full breadcrumb with \u00BB separator
    const select = page.locator("select");
    await expect(select.locator("option:has-text('Network \u00BB Mobile')")).toBeAttached();
    await expect(select.locator("option:has-text('Commercial \u00BB Retail')")).toBeAttached();
    await expect(select.locator("option:has-text('Transmission \u00BB Submarine Cable')")).toBeAttached();
  });

  test("deletes a definition from term detail page", async ({ page }) => {
    await page.goto("/terms/2"); // Latency has 2 definitions

    await expect(page.locator(".card")).toHaveCount(2);

    page.on("dialog", (dialog) => dialog.accept());

    // Delete the first definition
    await page.locator(".card").first().locator('button:has-text("Delete")').click();

    await expect(page.locator(".card")).toHaveCount(1);
  });

  test("deletes a definition inline from glossary view", async ({ page }) => {
    await page.goto("/terms");

    // Latency entry has 2 definitions
    const latencyEntry = page.locator(".glossary-entry:has-text('Latency')");
    await expect(latencyEntry.locator(".glossary-def")).toHaveCount(2);

    page.on("dialog", (dialog) => dialog.accept());

    // Click delete on first definition's actions
    const firstDef = latencyEntry.locator(".glossary-def").first();
    await firstDef.hover();
    await firstDef.locator('button:has-text("Delete")').click();

    await expect(latencyEntry.locator(".glossary-def")).toHaveCount(1);
  });
});
