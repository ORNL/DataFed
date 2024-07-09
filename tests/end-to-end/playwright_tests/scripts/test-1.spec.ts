import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
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