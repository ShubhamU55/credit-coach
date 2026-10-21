import { test, expect } from '@playwright/test';

test('admin home renders title and engine-backed value', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Credit Coach Admin' })).toBeVisible();
  await expect(page.getByTestId('engine-check')).toHaveText('Engine OK: 30%');
});
