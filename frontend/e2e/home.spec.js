import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("displays the home page with title and navigation cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Dictionary API");
    await expect(page.locator(".home-card")).toHaveCount(2);
    // Use more specific locators to avoid strict mode violations
    await expect(page.locator(".home-card h2:has-text('Terms')")).toBeVisible();
    await expect(page.locator(".home-card h2:has-text('Categories')")).toBeVisible();
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

  test("home card links navigate to correct pages", async ({ page }) => {
    await page.goto("/");

    await page.click('.home-card:has-text("Terms")');
    await expect(page).toHaveURL(/\/terms/);

    await page.goto("/");
    await page.click('.home-card:has-text("Categories")');
    await expect(page).toHaveURL(/\/categories/);
  });
});
