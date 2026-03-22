import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers.js";

test.describe("Backup page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test("displays the backup page with title and download button", async ({ page }) => {
    await page.goto("/backup");
    await expect(page.locator("h1")).toHaveText("Backup");
    await expect(page.locator("button.btn-primary")).toHaveText("Download Backup");
  });

  test("shows stats after clicking download", async ({ page }) => {
    await page.goto("/backup");

    // Intercept the download trigger (blob URL) so we don't actually save a file
    const downloadPromise = page.waitForEvent("download");
    await page.click("button.btn-primary");
    const download = await downloadPromise;

    // Verify the file name pattern
    expect(download.suggestedFilename()).toMatch(/^glossary-backup-.*\.json$/);

    // Stats should now be visible
    await expect(page.locator(".card-body")).toContainText("categories");
    await expect(page.locator(".card-body")).toContainText("terms");
  });

  test("shows error message when backup fails", async ({ page }) => {
    // Override the backup route to return an error (only for API requests)
    await page.route(/localhost:(5173|8000)\/backup\/?$/, async (route) => {
      const accept = route.request().headers()["accept"] || "";
      if (accept.includes("text/html")) {
        return route.fallback();
      }
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 500,
          json: { detail: "Server error" },
        });
      }
      return route.fallback();
    });

    await page.goto("/backup");
    await page.click("button.btn-primary");

    await expect(page.locator(".error-message")).toBeVisible();
  });
});
