import { expect, test } from '@playwright/test';

test('visitor remains local; owner authentication switches into an isolated, locked private workspace', async ({ page }) => {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) });
  });
  await page.route('**/api/auth/login', async (route) => {
    expect(route.request().method()).toBe('POST');
    const payload = JSON.parse(route.request().postData() || '{}');
    expect(payload.password).toBe('strong test password 2026');
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, csrfToken: 'b'.repeat(64) }) });
  });
  await page.route('**/api/auth/logout', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe('b'.repeat(64));
    await route.fulfill({ status: 204, body: '' });
  });

  let revision = 0;
  await page.route('**/api/owner/ledger', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision, bundle: null }) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const request = JSON.parse(route.request().postData() || '{}');
      expect(request.expectedRevision).toBe(revision);
      expect(route.request().headers()['x-csrf-token']).toBe('b'.repeat(64));
      revision += 1;
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, revision }) });
    }
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'دخول المالك', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'دخول المالك', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'تسجيل دخول المالك' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('كلمة مرور المالك').fill('strong test password 2026');
  await dialog.getByRole('button', { name: 'تسجيل الدخول' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('مساحة المالك الخاصة')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'لوحة التحكم المالية' })).toBeVisible();
  expect(revision).toBeGreaterThan(0);
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  }
  await page.getByRole('button', { name: 'تسجيل خروج المالك' }).click();
  await expect(page.getByRole('button', { name: 'دخول المالك', exact: true })).toBeVisible();
});
