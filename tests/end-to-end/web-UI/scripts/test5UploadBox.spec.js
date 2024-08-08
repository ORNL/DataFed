import { test, expect } from '@playwright/test';

test('test upload box', async ({ page }) => {
    await page.goto('/'); // baseURL is in playwright.config

    // TODO REUSE OLD record creation code here
    await page.getByText('Root Collectionc/').click({
      button: 'right'
    });
    await page.getByRole('menuitem', { name: ' New' }).click();
    await page.getByRole('menuitem', { name: 'Data Record' }).click();
    await page.getByRole('textbox', { name: 'Title string (required)' }).fill('test');
    await page.getByRole('textbox', { name: 'Description string (optional)' }).fill('test');
    await page.getByRole('button', { name: 'Create' }).click();

    await page.getByText('testd/').click();
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('#path').click();
    await page.locator('#path').fill('esnet');
  // await page.waitForTimeout(3000);
  // or this: locator('#matches-button').getByText('matches')
    await page.getByRole('combobox', { name: 'matches' }).click(); //TODO figure out why this isn't working
    await expect(page.getByRole('option', { name: 'ESnet CERN DTN private' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ESnet Denver DTN private' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'ESnet Houston DTN private' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('span').filter({ hasText: 'testd/' }).first().click();
    await page.locator('span').filter({ hasText: 'testd/' }).first().click({
      button: 'right'
    });
    await page.getByRole('menuitem', { name: ' Actions' }).locator('span').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByLabel('Confirm Deletion').getByRole('button', { name: 'Delete' }).click();
});