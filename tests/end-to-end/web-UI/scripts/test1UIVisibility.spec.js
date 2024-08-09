import { test, expect } from '@playwright/test'; //to write a test file, just follow this format

// just expanding things and checking visibility of elements
test('test visibility', async ({page}) => {
  try {
    await page.goto('/'); // root URL, if needed, change baseURL in playwright.config.js
    if (await page.getByRole('button', { name: 'Log In / Register' }).isVisible()) {
      console.log("NOT LOGGED IN");
    } 

    await expect(page.locator('.ui-icon').first()).toBeVisible({
      timeout: 20000
    });
    await expect(page.getByText('DataFed - Scientific Data')).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Data' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Catalog' })).toBeVisible();
    await expect(page.getByRole('button', { name: '' })).toBeVisible();

    await page.getByRole('treeitem', { name: '  Public Collections' }).getByRole('button').click();
    await page.getByRole('treeitem', { name: '  Public Collections' }).getByRole('group').click();
    await page.getByRole('treeitem', { name: '  Allocations' }).getByRole('button').click();
    await page.getByRole('treeitem', { name: '  Project Data' }).getByRole('button').click();
    await page.getByRole('treeitem', { name: '  Shared Data' }).getByRole('button').click();
    await page.getByRole('treeitem', { name: '  Saved Queries' }).locator('span').first().click();
    await page.getByRole('treeitem', { name: '  Saved Queries' }).getByRole('button').click();
  } catch (error) {

    // element not visible, either the test broke due to tags changing, or not logged in
    // try to log out, because if not logged out, future tests will fail due to globus being annoying
    if (await page.getByRole('button', { name: '' }).isVisible()) {
      await page.getByRole('button', { name: '' }).click();
      throw error;
    } else {
      // if in here, check if you logged out properly
      throw error;
    }
  }
});
