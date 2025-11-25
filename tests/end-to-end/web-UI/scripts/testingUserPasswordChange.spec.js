import { test, expect } from "@playwright/test";

// checking visibility and expanding some dropdowns
test.describe("DataFed UI password change", () => {
    // Since auth is handled by global setup, we start from authenticated state
    test.beforeEach(async ({ page }) => {
        const domain = process.env.DATAFED_DOMAIN || "domain.com";

        // Navigate to main page (already authenticated via storageState)
        await page.goto(`https://${domain}/ui/main`, {
            waitUntil: "networkidle",
        });

        // Verify we're on the main page and authenticated
        await expect(page).toHaveURL(new RegExp(`https://${domain}/ui/main`));

        // Wait for main UI to be ready
        await page
            .waitForSelector('[data-testid="main-content"], .main-content, #main', {
                state: "visible",
                timeout: 3000,
            })
            .catch(() => {
                // Fallback: just wait for any main element
                return page.waitForTimeout(2000);
            });

        // Log current page state for debugging
        console.log(`INFO - Test starting on: ${page.url()}`);
    });

    test("should display main page after entering password", async ({ page }) => {
        await test.step("Open settings menu", async () => {
            const button = page.locator("#btn_settings");

            if (await button.isVisible()) {
                console.log("INFO - Button is visible (btn_settings)");
                await button.click();
            } else {
                console.log("INFO - Button is not visible (btn_settings)");
            }
        });

        await test.step("Enter password and confirmation password", async () => {
            // Define locators for the elements
            const newPasswordInput = page.locator("#cli_new_pw");
            const confirmPasswordInput = page.locator("#cli_confirm_pw");
            const revokeButton = page.locator("#btn_revoke_cred");
            const saveButton = page.getByRole("button", { name: "Save" });

            // Wait for all elements to be visible
            await Promise.all([
                newPasswordInput.waitFor({ state: "visible", timeout: 5000 }),
                confirmPasswordInput.waitFor({ state: "visible", timeout: 5000 }),
                revokeButton.waitFor({ state: "visible", timeout: 5000 }),
                saveButton.waitFor({ state: "visible", timeout: 5000 }),
            ]);
            await newPasswordInput.click();
            await newPasswordInput.fill("Terrible2s!!!");
            await confirmPasswordInput.click();
            await confirmPasswordInput.fill("Terrible2s!!!");
            await saveButton.click();
            // Make sure an error does not appear.
            // Unfortunately it take a while for the error to show up
            await page.waitForTimeout(15000);

            await page.screenshot({ path: 'change-password-has-error.png', fullPage: true });

            // These WILL fail if error appears
            await expect(page.getByText('Save Settings Error')).not.toBeVisible();
        });
    });
});
