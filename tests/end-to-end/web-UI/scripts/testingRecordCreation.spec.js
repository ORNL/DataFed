import { test, expect } from '@playwright/test';

test('test making records', async ({ page }) => {
    await page.goto('/');
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
  