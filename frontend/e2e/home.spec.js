import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("displays the home page with title and glossary list builder", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Telecom Glossary");
    await expect(page.locator(".builder-controls")).toBeVisible();
    await expect(page.locator('input[placeholder="Search and add terms..."]')).toBeVisible();
    await expect(page.locator(".builder-lang-select")).toBeVisible();
  });

  test("navbar links navigate correctly", async ({ page }) => {
    await page.goto("/");

    await page.click('.navbar-links a:has-text("Terms")');
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.locator("h1")).toHaveText("Glossary");

    await page.click('.navbar-links a:has-text("Categories")');
    await expect(page).toHaveURL(/\/categories/);
    await expect(page.locator("h1")).toHaveText("Categories");

    await page.click(".navbar-brand a");
    await expect(page).toHaveURL("/");
  });

  test("search finds terms and adds them to the glossary list", async ({ page }) => {
    await page.goto("/");

    // Search for a term
    const searchInput = page.locator('input[placeholder="Search and add terms..."]');
    await searchInput.fill("Band");
    await expect(page.locator(".builder-dropdown")).toBeVisible();
    await expect(page.locator(".builder-dropdown-term")).toHaveText("Bandwidth");

    // Click to add it
    await page.locator(".builder-dropdown-item").first().click();

    // Term should appear in the table
    await expect(page.locator(".builder-table")).toBeVisible();
    await expect(page.locator(".builder-cell-term")).toHaveText("Bandwidth");

    // Search input should be cleared
    await expect(searchInput).toHaveValue("");
  });

  test("language selector switches displayed definitions", async ({ page }) => {
    await page.goto("/");

    // Add a term that has both EN and DA definitions
    const searchInput = page.locator('input[placeholder="Search and add terms..."]');
    await searchInput.fill("Band");
    await page.locator(".builder-dropdown-item").first().click();

    // Default is English
    await expect(page.locator(".builder-table tbody td").nth(1)).toContainText(
      "The maximum rate of data transfer"
    );

    // Switch to Danish
    await page.locator(".builder-lang-select").selectOption("da");
    await expect(page.locator(".builder-table tbody td").nth(1)).toContainText(
      "Den maksimale dataoverførselshastighed"
    );
  });

  test("remove button removes a term from the list", async ({ page }) => {
    await page.goto("/");

    // Add a term
    const searchInput = page.locator('input[placeholder="Search and add terms..."]');
    await searchInput.fill("Band");
    await page.locator(".builder-dropdown-item").first().click();
    await expect(page.locator(".builder-table")).toBeVisible();

    // Remove it
    await page.locator(".btn-danger:has-text('Remove')").click();
    await expect(page.locator(".builder-table")).not.toBeVisible();
    await expect(page.locator(".empty")).toBeVisible();
  });

  test("clear list removes all terms", async ({ page }) => {
    await page.goto("/");

    // Add two terms
    const searchInput = page.locator('input[placeholder="Search and add terms..."]');
    await searchInput.fill("Band");
    await page.locator(".builder-dropdown-item").first().click();

    await searchInput.fill("Lat");
    await page.locator(".builder-dropdown-item").first().click();

    await expect(page.locator(".builder-table tbody tr")).toHaveCount(2);

    // Clear
    await page.locator(".btn-danger:has-text('Clear list')").click();
    await expect(page.locator(".builder-table")).not.toBeVisible();
  });

  test("already-added terms are marked in the dropdown", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator('input[placeholder="Search and add terms..."]');

    // Add Bandwidth
    await searchInput.fill("Band");
    await page.locator(".builder-dropdown-item").first().click();

    // Search again — should show "added" label
    await searchInput.fill("Band");
    await expect(page.locator(".builder-dropdown-added")).toHaveText("added");
  });
});
