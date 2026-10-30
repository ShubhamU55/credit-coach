import { test, expect, type Page } from '@playwright/test';

const FAKE = 'http://127.0.0.1:54399';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const signInAsAdmin = (page: Page) => signIn(page, 'admin@example.com', 'admin-pass');

test.beforeEach(async ({ request }) => {
  await request.post(`${FAKE}/__reset`);
});

test.describe('login', () => {
  test('redirects an unauthenticated visitor to /login', async ({ page }) => {
    for (const path of ['/rules', '/audit', '/profiles']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('rejects a wrong password and stays on /login', async ({ page }) => {
    await signIn(page, 'admin@example.com', 'wrong');
    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs an admin in, then out', async ({ page }) => {
    await signInAsAdmin(page);
    await expect(page).toHaveURL(/\/rules$/);
    await expect(page.getByTestId('signed-in-as')).toHaveText('admin@example.com');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/rules');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('rules and audit', () => {
  test('an admin edit is saved and shows up in the audit log', async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByLabel('Utilization threshold (%)').fill('20');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.getByTestId('save-ok')).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page).toHaveURL(/\/audit$/);
    const row = page.getByTestId('audit-row').first();
    await expect(row).toContainText('coach_rules');
    await expect(row).toContainText('UPDATE');
    await expect(row).toContainText('threshold_pct: 30 → 20');
    await expect(row).not.toContainText('updated_at');

    await page.getByRole('link', { name: 'Rules' }).click();
    await expect(page.getByLabel('Utilization threshold (%)')).toHaveValue('20');
  });

  test('a 51% threshold is rejected in the browser and nothing is saved', async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByLabel('Utilization threshold (%)').fill('51');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.getByText('Enter a whole number from 5 to 50.')).toBeVisible();
    await expect(page.getByTestId('save-ok')).toHaveCount(0);

    await page.goto('/audit');
    await expect(page.getByTestId('audit-empty')).toBeVisible();
  });
});

test.describe('non-admin', () => {
  test('sees "not an admin" and cannot edit', async ({ page }) => {
    await signIn(page, 'viewer@example.com', 'viewer-pass');
    await expect(page.getByTestId('not-admin')).toContainText('Not an admin');
    await expect(page.getByRole('button', { name: 'Save rules' })).toHaveCount(0);
    await expect(page.getByLabel('Utilization threshold (%)')).toHaveCount(0);

    await page.goto('/audit');
    await expect(page.getByTestId('not-admin')).toBeVisible();
    await expect(page.getByTestId('audit-row')).toHaveCount(0);
  });
});

test.describe('sample profiles', () => {
  test('lists the profiles read-only and never renders an unmasked PAN or mobile', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.getByRole('link', { name: 'Sample profiles' }).click();
    await expect(page.getByTestId('profile-row')).toHaveCount(2);
    await expect(page.getByText('ABXXXXX34F')).toBeVisible();
    await expect(page.getByText('+91 98XXXXX321')).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('ABCDE1234F');
    expect(html).not.toContain('9876543210');
    await expect(page.getByRole('button', { name: /save|edit|delete/i })).toHaveCount(0);
  });
});
