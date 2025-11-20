import { test, expect } from "@playwright/test";

// checking visibility and expanding some dropdowns
test.describe("DataFed UI Navigation", () => {
    test("should display main navigation elements", async ({ page }) => {
        const domain = process.env.DATAFED_DOMAIN;
        if (!domain) {
            throw new Error("DATAFED_DOMAIN environment variable not set");
        }

        await page.goto(`https://${domain}/`);

        // Handle optional registration continuation
        const continueReg = page.getByText("Continue Registration");
        if (await continueReg.isVisible()) {
            await continueReg.click();
        }

        // Verify main elements
        await expect(page.locator(".ui-icon").first()).toBeVisible();
        await expect(page.getByText("DataFed - Scientific Data")).toBeVisible();
        await expect(page.getByRole("link", { name: "My Data" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Catalog" })).toBeVisible();
    });

    test("should expand tree navigation items", async ({ page }) => {
        const domain = process.env.DATAFED_DOMAIN;
        if (!domain) {
            throw new Error("DATAFED_DOMAIN environment variable not set");
        }

        await page.goto(`https://${domain}/`);

        // Define tree items to expand
        const treeItems = [
            "Public Collections",
            "Allocations",
            "Project Data",
            "Shared Data",
            "Saved Queries",
            "By User",
        ];

        for (const item of treeItems) {
            const treeItem = page.getByRole("treeitem", { name: new RegExp(item) });
            await treeItem.getByRole("button").click();
            // Add assertion that it expanded if needed
        }
    });
});
