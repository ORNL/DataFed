import { test, expect } from '@playwright/test';
// const process = require('process');
//const authSetup = require('../auth.setup.js'); 
//let page;

// test.beforeAll(async ({ browser }) => {
//   // makes a new page object if none exist, also ensures page is linked to the test after this before hook.
 
//   console.log("******Login in******")
//   page = await authSetup({ browser });
// });

 // checking visibility and expanding some dropdowns
test('test visibility', async ({page}) => {
  try {
    console.log("******Begin test******");  
    await page.goto('https://localhost/')
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
    await page.getByText('Provenance Annotate Upload').click({ timeout: 20000 });
    await page.getByRole('treeitem', { name: '  By User' }).getByRole('button').click();

  } catch (error) {

    // element not visible, either the test broke due to tags changing, or not logged in
    // try to log out, because if not logged out, future tests will fail due to globus being annoying
    if (await page.getByRole('button', { name: '' }).isVisible()) {
      await page.getByRole('button', { name: '' }).click();
    } else {
      // if in here, check if you logged out properly
      throw error;
    }
  }
});

test('test making records', async ({ page }) => {
  await page.goto('https://localhost/')
  await page.getByText('Root Collectionc/').click({
    button: 'right'
  });
  await page.getByRole('menuitem', { name: ' Actions' }).locator('span').click();
  await page.getByRole('menuitem', { name: 'Sharing' }).click();
  await expect(page.getByText('Permissions for Collection "')).toBeVisible();
  await expect(page.getByText('Permissions:')).toBeVisible();
  await expect(page.getByText('Local:')).toBeVisible();
  await expect(page.getByText('Inherited:')).toBeVisible();
  await expect(page.getByText('Users', { exact: true })).toBeVisible();
  await expect(page.getByText('Groups')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add User' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Group' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ok' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.getByRole('button', { name: ' Close' })).toBeVisible();
  await page.getByRole('button', { name: ' Close' }).click();
  await page.getByRole('button', { name: '' }).click();
  await page.getByRole('textbox', { name: 'Title string (required)' }).click();
  await page.getByRole('textbox', { name: 'Title string (required)' }).fill('testrecord');
  await page.getByRole('textbox', { name: 'Description string (optional)' }).click();
  await page.getByRole('textbox', { name: 'Description string (optional)' }).fill('TESTONLY');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('testrecord')).toBeVisible();
  await page.getByText('testrecord').click({
    button: 'right'
  });
  await page.getByRole('menuitem', { name: ' Actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByLabel('Edit Data Record d/').getByRole('link', { name: 'Metadata' }).click();
  await page.getByRole('link', { name: 'Relationships' }).click();
  await page.getByRole('row', { name: '' }).locator('span').nth(1).click();
  await expect(page.getByRole('option', { name: 'Is a component of' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Is newer version of' })).toBeVisible();
  await page.getByRole('cell', { name: 'Is derived from' }).locator('span').nth(1).click();
  await page.getByRole('button', { name: 'Add Relationship' }).click();
  await expect(page.getByRole('row', { name: '', exact: true }).locator('span').nth(1)).toBeVisible();
  await page.getByRole('row', { name: '', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: ' Close' }).click();
  await page.locator('span').filter({ hasText: 'testrecordd/' }).first().click({
    button: 'right'
  });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByLabel('Confirm Deletion').getByRole('button', { name: 'Delete' }).click();
})
