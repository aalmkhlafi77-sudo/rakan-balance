import { expect, test } from '@playwright/test';

test('private owner account from MySQL response cannot appear in visitor local IndexedDB', async ({ page }) => {
  const secret = 'حساب خاص بالمالك للتحقق من العزل';
  const ownerData = {
    accounts: [{
      id: 'owner-private-acc', name: secret, parentId: null,
      categoryId: 'cat-private', openingBalanceMinor: 12345,
      status: 'active', isDemo: false,
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    }],
    categories: [{ id: 'cat-private', name: 'حسابات خاصة', sortOrder: 1 }],
    transactions: [], attachments: [], notes: [], dues: [], allocations: [], reminders: [],
  };
  await page.route('**/api/auth/status', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
  }));
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, csrfToken: 'c'.repeat(64) }),
  }));
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/owner/ledger', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ revision: 1, bundle: { data: ownerData } }),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'دخول المالك', exact: true }).click();
  await page.getByLabel('كلمة مرور المالك').fill('correct password to test');
  await page.getByRole('dialog', { name: 'تسجيل دخول المالك' })
    .getByRole('button', { name: 'تسجيل الدخول' }).click();

  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  }
  await expect(page.getByText('مساحة المالك الخاصة')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'دليل الحسابات', exact: true }).click();
  await expect(page.getByText(secret)).toBeVisible();

  const foundInVisitorDb = await page.evaluate(async () => {
    const open = indexedDB.open('RakanBalanceDB_v2', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const tx = db.transaction('accounts', 'readonly');
      const get = tx.objectStore('accounts').getAll();
      return await new Promise<boolean>((resolve, reject) => {
        get.onsuccess = () => resolve(get.result.some((a: { name: string }) => a.name.includes('المالك للتحقق')));
        get.onerror = () => reject(get.error);
      });
    } finally { db.close(); }
  });
  expect(foundInVisitorDb).toBe(false);

  if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('button', { name: 'تسجيل خروج المالك' }).click();
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  // First-setup modal is mounted asynchronously after leaving the private owner tree.
  await expect(setup).toBeVisible();
  await setup.click();
  await expect(setup).toBeHidden();
  if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'دليل الحسابات', exact: true }).click();
  await expect(page.getByText(secret)).toHaveCount(0);
});
