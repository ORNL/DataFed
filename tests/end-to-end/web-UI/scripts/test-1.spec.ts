import { test, expect } from '@playwright/test';

test('homescreen for datafed', async ({ page }) => {
  await page.goto('https://datafed.ornl.gov/ui/welcome');
  await expect(page.getByText('DataFed - A Scientific Data')).toBeVisible();
  const page2Promise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Help' }).click();
  const page2 = await page2Promise;
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log In / Register' })).toBeVisible();
  await expect(page.locator('span').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '"Getting Started"' })).toBeVisible();
  const page3Promise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '"Getting Started"' }).click();
  const page3 = await page3Promise;
  await expect(page3.getByText('DataFed Getting Started')).toBeVisible();
  await expect(page3.locator('h1')).toContainText('Getting Started');
 
});

// Ding: will not run, need to find ways to log in first

test('after logging in', async ({ page }) => {
  await expect(page.getByText('DataFed - Scientific Data')).toBeVisible();
  await expect(page.getByRole('button', { name: '' })).toBeVisible();
  await expect(page.getByRole('button', { name: '' })).toBeVisible();
  await expect(page.getByRole('button', { name: '' })).toBeVisible();
  await expect(page.locator('body')).toContainText('DataFed - Scientific Data Federation');
  await expect(page.locator('#sel_info_title')).toContainText('Select an item in left-hand panels to view additional information.');
  await expect(page.locator('#ui-id-83')).toContainText('Personal Data');
  await expect(page.locator('#ui-id-84')).toContainText('Root Collection');
  await expect(page.locator('#ui-id-84')).toContainText('c/u_dingc_root');
  await expect(page.locator('#ui-id-85')).toContainText('Public Collections');
  await expect(page.locator('#ui-id-86')).toContainText('Allocations');
  await expect(page.locator('#ui-id-87')).toContainText('Project Data');
  await expect(page.locator('#ui-id-88')).toContainText('Shared Data');
  await expect(page.locator('#ui-id-89')).toContainText('Saved Queries');
  await page.getByRole('treeitem', { name: '  Project Data' }).getByRole('button').click();
  await expect(page.getByText('Intern Sandbox')).toBeVisible();
  await expect(page.getByText('p/internsandbox')).toBeVisible();
  await page.getByRole('treeitem', { name: '  Intern Sandbox p/' }).getByRole('button').click();
  await expect(page.locator('#ui-id-87').getByText('Root Collection')).toBeVisible();
  await expect(page.locator('#ui-id-87').getByText('Public Collections')).toBeVisible();
  await expect(page.locator('#ui-id-87').getByText('Public Collections')).toBeVisible();
  await page.locator('#ui-id-87').getByRole('treeitem', { name: '  Allocations' }).getByRole('button').click();
  await expect(page.getByText('cades-cnms (default)')).toBeVisible();
  await page.getByRole('treeitem', { name: '  cades-cnms (default)' }).getByRole('button').click();
  await page.getByRole('treeitem', { name: '  Shared Data' }).getByRole('button').click();
  await page.getByRole('treeitem', { name: '  By User' }).getByRole('button').click();
  await page.getByRole('treeitem', { name: '  By Project' }).getByRole('button').click();
  await expect(page.getByText('By User')).toBeVisible();
  await expect(page.locator('#ui-id-94')).toContainText('By User');
  await page.getByRole('button', { name: '' }).click();
  await expect(page.getByText('User Interface Task History:')).toBeVisible();
  await expect(page.getByText('DataFed Settings')).toBeVisible();
  await expect(page.getByRole('row', { name: 'Revoke Credentials' }).getByRole('cell').first()).toBeVisible();
  await expect(page.getByLabel('DataFed Settings')).toContainText('Save');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.getByText('User Interface Task History:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke Credentials' })).toBeVisible();
  await page.getByRole('button', { name: ' Close' }).click();
  await page.locator('#sel_info_icon').click();
  await page.getByText('Data shared with you by users.').click();
  await page.getByRole('link', { name: 'Catalog' }).click();
  await page.getByRole('button', { name: 'Schemas' }).click();
  await expect(page.getByText('Manage Schemas')).toBeVisible();
  await expect(page.getByText('(no matches)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await expect(page.getByText('New View Edit Revise Delete')).toBeVisible();
});