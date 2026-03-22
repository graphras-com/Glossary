import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Search and filter", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("search filters terms by name", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator(".glossary-entry")).toHaveCount(3);

    await page.fill('input[placeholder="Search terms..."]', "band");
    await expect(page.locator(".glossary-entry")).toHaveCount(1);
    await expect(page.locator(".glossary-term:has-text('Bandwidth')")).toBeVisible();
  });

  test("search is case-insensitive", async ({ page }) => {
    await page.goto("/terms");
    await page.fill('input[placeholder="Search terms..."]', "LATENCY");
    await expect(page.locator(".glossary-entry")).toHaveCount(1);
    await expect(page.locator(".glossary-term:has-text('Latency')")).toBeVisible();
  });

  test("category filter limits terms to those with matching definitions", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator(".glossary-entry")).toHaveCount(3);

    // The category filter select shows breadcrumb labels
    await page.locator(".filters select").selectOption({ label: "Commercial \u00BB Retail" });

    // Only Churn has a commercial.retail definition
    await expect(page.locator(".glossary-entry")).toHaveCount(1);
    await expect(page.locator(".glossary-term:has-text('Churn')")).toBeVisible();
  });

  test("search and category filter work together", async ({ page }) => {
    await page.goto("/terms");

    await page.fill('input[placeholder="Search terms..."]', "la");
    await page.locator(".filters select").selectOption({ label: "Network \u00BB Mobile" });

    // Latency has a network.mobile def AND matches "la"
    await expect(page.locator(".glossary-entry")).toHaveCount(1);
    await expect(page.locator(".glossary-term:has-text('Latency')")).toBeVisible();
  });

  test("clearing search shows all terms again", async ({ page }) => {
    await page.goto("/terms");
    await page.fill('input[placeholder="Search terms..."]', "band");
    await expect(page.locator(".glossary-entry")).toHaveCount(1);

    await page.fill('input[placeholder="Search terms..."]', "");
    await expect(page.locator(".glossary-entry")).toHaveCount(3);
  });

  test("no results shows empty state", async ({ page }) => {
    await page.goto("/terms");
    await page.fill('input[placeholder="Search terms..."]', "xyznonexistent");
    await expect(page.locator(".glossary-entry")).toHaveCount(0);
    await expect(page.locator("text=No terms found.")).toBeVisible();
  });

  test("category filter dropdown shows breadcrumb labels", async ({ page }) => {
    await page.goto("/terms");

    const select = page.locator(".filters select");
    // Child categories should show full breadcrumb with » separator
    await expect(select.locator("option:has-text('Commercial \u00BB Retail')")).toBeAttached();
    await expect(select.locator("option:has-text('Network \u00BB Mobile')")).toBeAttached();
    await expect(select.locator("option:has-text('Transmission \u00BB Submarine Cable')")).toBeAttached();

    // Top-level categories should show just their label
    await expect(select.locator("option[value='commercial']")).toHaveText("Commercial");
    await expect(select.locator("option[value='network']")).toHaveText("Network");
  });

  test("search term persists in URL as query param", async ({ page }) => {
    await page.goto("/terms");
    await page.fill('input[placeholder="Search terms..."]', "churn");
    await expect(page).toHaveURL(/q=churn/);
  });
});
