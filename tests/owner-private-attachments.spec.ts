import { expect, test } from '@playwright/test';

test('owner private attachment is fetched only when preview opens and never persisted as Base64 ledger data', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const ownerData = {
    accounts: [{
      id: 'acc_private', name: 'حساب خاص', parentId: null, categoryId: 'cat_private',
      openingBalanceMinor: 0, status: 'active',
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    }],
    categories: [{ id: 'cat_private', name: 'خاص', sortOrder: 1 }],
    transactions: [{
      id: 'tx_private', accountId: 'acc_private', entryType: 'owedByAccount',
      amountMinor: 100, date: '2026-11-08', description: 'حركة بمرفق خاص',
      attachmentIds: ['att_private'],
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    }],
    attachments: [{
      id: 'att_private', transactionId: 'tx_private', originalName: 'private.png',
      mimeType: 'image/png', size: png.length,
      dataUrl: 'rakan-private://attachment/att_private',
      createdAt: '2026-11-08T00:00:00Z',
    }],
    notes: [], dues: [], allocations: [], reminders: [],
  };

  let blobRequests = 0;
  await page.route('**/api/auth/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ authenticated: false }),
  }));
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, csrfToken: 'd'.repeat(64) }),
  }));
  await page.route('**/api/owner/ledger', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ revision: 4, bundle: { data: ownerData } }),
  }));
  await page.route('**/api/owner/attachment-blobs/att_private', async route => {
    blobRequests += 1;
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
      body: png,
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'دخول المالك', exact: true }).click();
  await page.getByLabel('كلمة مرور المالك').fill('private attachment browser test');
  await page.getByRole('dialog', { name: 'تسجيل دخول المالك' })
    .getByRole('button', { name: 'تسجيل الدخول' }).click();

  expect(blobRequests).toBe(0);
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  }
  await page.getByRole('navigation').getByRole('button', { name: 'دفتر الحركات', exact: true }).click();
  const isMobile = page.viewportSize()!.width < 768;
  const description = isMobile
    ? page.getByTestId('mobile-transaction-card').getByText('حركة بمرفق خاص')
    : page.getByRole('table').getByText('حركة بمرفق خاص');
  await expect(description).toBeVisible();
  const preview = isMobile
    ? page.getByRole('button', { name: 'معاينة: private.png' })
    : page.getByTitle('معاينة: private.png');
  await preview.click();

  const image = page.getByAltText('private.png');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^blob:/);
  expect(blobRequests).toBeGreaterThanOrEqual(1);
});
