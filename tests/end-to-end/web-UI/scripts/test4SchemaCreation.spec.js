import { test, expect } from '@playwright/test';

test('test schema creation', async ({ page }) => {
    await page.goto('/'); // baseURL is in playwright.config
    await page.waitForTimeout(3000);
    await page.locator("#btn_schemas").click();
    //await page.locator("#btn_schemas").click({timeout: 2000}); // Only clicking twice opens it, fix this later plz
    await expect(page.getByText('Manage Schemas')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('(no matches)')).toBeVisible();
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('textbox', { name: 'Schema ID' }).fill('123456789');
    await page.getByRole('textbox', { name: 'Description text (include' }).fill('test schema');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByText('123456789:').click();
    await page.getByTitle('Edit schema').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('123456789:').click();
    await page.getByTitle('Delete schema').click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('(no matches)')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
});