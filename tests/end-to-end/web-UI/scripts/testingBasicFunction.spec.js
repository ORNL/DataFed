import { test, expect } from "@playwright/test";

// checking visibility and expanding some dropdowns
test("test visibility", async ({ page }) => {
    try {
        console.log("******Begin test******");
        // Temporary fix
        let domain = process.env.DATAFED_DOMAIN;
        await page.goto("https://" + domain + "/");
        if (await page.getByRole("button", { name: "Log In / Register" }).isVisible()) {
            console.log("NOT LOGGED IN");
        }
        if (await expect(page.getByText("Continue Registration")).toBeVisible()) {
            await page.getByText("Continue Registration").click({ timeout: 20000 });
        }
        await expect(page.locator(".ui-icon").first()).toBeVisible({
            timeout: 20000,
        });
        await expect(page.getByText("DataFed - Scientific Data")).toBeVisible();
        await expect(page.getByRole("link", { name: "My Data" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Catalog" })).toBeVisible();
        await expect(page.getByRole("button", { name: "" })).toBeVisible();

        await page
            .getByRole("treeitem", { name: "  Public Collections" })
            .getByRole("button")
            .click();
        await page
            .getByRole("treeitem", { name: "  Public Collections" })
            .getByRole("group")
            .click();
        await page.getByRole("treeitem", { name: "  Allocations" }).getByRole("button").click();
        await page.getByRole("treeitem", { name: "  Project Data" }).getByRole("button").click();
        await page.getByRole("treeitem", { name: "  Shared Data" }).getByRole("button").click();
        await page
            .getByRole("treeitem", { name: "  Saved Queries" })
            .locator("span")
            .first()
            .click();
        await page.getByRole("treeitem", { name: "  Saved Queries" }).getByRole("button").click();
        await page.getByText("Provenance Annotate Upload").click({ timeout: 20000 });
        await page.getByRole("treeitem", { name: "  By User" }).getByRole("button").click();
    } catch (error) {
        // element not visible, either the test broke due to tags changing, or not logged in
        // try to log out, because if not logged out, future tests will fail due to globus being annoying
        if (await page.getByRole("button", { name: "" }).isVisible()) {
            await page.getByRole("button", { name: "" }).click();
        } else {
            // if in here, check if you logged out properly
            throw error;
        }
    }
    //removed logout
});
