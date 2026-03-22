import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Categories CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("displays all categories in a table", async ({ page }) => {
    await page.goto("/categories");

    await expect(page.locator("h1")).toHaveText("Categories");
    await expect(page.locator("table tbody tr")).toHaveCount(6);
    // Use exact text match for label cells to avoid matching ID/parent columns
    await expect(page.getByRole("cell", { name: "Commercial", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Network", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Transmission", exact: true })).toBeVisible();
  });

  test("shows parent category IDs where present", async ({ page }) => {
    await page.goto("/categories");

    // Retail row should show parent "commercial" — use exact text match for code
    const retailRow = page.locator("tr:has(code:text-is('commercial.retail'))");
    // The parent column should have code element with exact text "commercial"
    await expect(retailRow.locator("code:text-is('commercial')")).toBeVisible();

    // Commercial (top-level) should show "--"
    // Find the row where the ID column is exactly "commercial" (not commercial.retail)
    const allCommercialRows = page.locator("tr:has(code:text-is('commercial'))");
    // The first match is the "commercial" row itself (not "commercial.retail")
    const commercialRow = allCommercialRows.first();
    await expect(commercialRow.locator(".muted")).toBeVisible();
  });

  test("creates a new category", async ({ page }) => {
    await page.goto("/categories");
    await page.click('a:has-text("+ New Category")');
    await expect(page).toHaveURL(/\/categories\/new/);

    await page.fill('input[placeholder*="e.g."]', "network.wireless");
    // Label field – second input
    const labelInput = page.locator(".form-group").filter({ hasText: "Label" }).locator("input");
    await labelInput.fill("Wireless");
    // CategoryCreate renders options as "{c.label} ({c.id})" e.g. "Network (network)"
    await page.selectOption("select", { label: "Network (network)" });

    await page.click('button:has-text("Create Category")');
    await expect(page).toHaveURL(/\/categories$/);
    // New category should now appear
    await expect(page.locator("table tbody tr")).toHaveCount(7);
  });

  test("edits a category", async ({ page }) => {
    await page.goto("/categories");

    const firstRow = page.locator("table tbody tr").first();
    await firstRow.locator('a:has-text("Edit")').click();
    await expect(page).toHaveURL(/\/categories\/.+\/edit/);

    const labelInput = page.locator(".form-group").filter({ hasText: "Label" }).locator("input");
    await labelInput.clear();
    await labelInput.fill("Commercial (Updated)");
    await page.click('button:has-text("Save Changes")');
    await expect(page).toHaveURL(/\/categories$/);
  });

  test("deletes a category after confirmation", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.locator("table tbody tr")).toHaveCount(6);

    page.on("dialog", (dialog) => dialog.accept());

    const lastRow = page.locator("table tbody tr").last();
    await lastRow.locator('button:has-text("Delete")').click();

    await expect(page.locator("table tbody tr")).toHaveCount(5);
  });

  test("cancel button returns to list without saving", async ({ page }) => {
    await page.goto("/categories/new");
    await page.click('button:has-text("Cancel")');
    await expect(page).toHaveURL(/\/categories$/);
  });
});
