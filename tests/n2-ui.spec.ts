import { expect, test } from '@playwright/test';

async function openDemoDues(page: import('@playwright/test').Page) {
  await page.goto('/');
  const setupButton = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  if (await setupButton.isVisible()) {
    await setupButton.click();
    await expect(setupButton).toBeHidden();
  }
  if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'الاستحقاقات والتذكيرات' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'متابعة الاستحقاقات والتذكيرات' })).toBeVisible();
}

async function snapshotDemo(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('RakanBalanceDB_v2', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ['demo_transactions', 'demo_dues', 'demo_payment_allocations', 'demo_reminders'];
    const tx = db.transaction(names, 'readonly');
    const fetch = (store: string) => new Promise<any[]>((resolve, reject) => {
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const [transactions, dues, allocations, reminders] = await Promise.all(names.map(fetch));
    db.close();
    return { transactions, dues, allocations, reminders };
  });
}

for (const device of ['desktop', 'mobile'] as const) {
  test(`N2: due, single-entry partial payment, reminder and persistence — ${device}`, async ({ page }, testInfo) => {
    test.skip(device === 'desktop' !== testInfo.project.name.startsWith('desktop'), 'Run matching device variant');
    await openDemoDues(page);
    const before = await snapshotDemo(page);

    const addForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'حفظ موعد الاستحقاق' }) });
    await addForm.locator('select').nth(0).selectOption('demo-acc-1');
    await addForm.getByPlaceholder('مثال: 500.00').fill('150.25');
    await addForm.locator('input[type="date"]').fill('2026-12-30');
    await addForm.getByRole('button', { name: 'حفظ موعد الاستحقاق' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'تم تسجيل الاستحقاق' })).toBeVisible();

    const afterDue = await snapshotDemo(page);
    expect(afterDue.dues).toHaveLength(before.dues.length + 1);
    expect(afterDue.transactions).toHaveLength(before.transactions.length);
    const due = afterDue.dues.find(d => d.originalAmountMinor === 15025 && d.accountId === 'demo-acc-1');
    expect(due).toBeTruthy();

    const row = page.locator('article').filter({ hasText: '2026-12-30' }).first();
    await expect(row).toContainText('150.25');
    await row.getByRole('button', { name: 'تسجيل سداد جزئي / كامل' }).click();
    await row.locator('input[inputmode="decimal"]').fill('200.00');
    await row.getByRole('button', { name: 'تأكيد السداد والربط بالحركة' }).click();
    await expect(page.getByRole('alert')).toContainText('تتجاوز المتبقي');
    const afterRejectedPayment = await snapshotDemo(page);
    expect(afterRejectedPayment.transactions).toHaveLength(before.transactions.length);
    expect(afterRejectedPayment.allocations).toHaveLength(before.allocations.length);
    expect(afterRejectedPayment.dues.find(d => d.id === due.id)?.settledAmountMinor).toBe(0);
    await row.locator('input[inputmode="decimal"]').fill('50.25');
    await row.getByRole('button', { name: 'تأكيد السداد والربط بالحركة' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'حركة سداد واحدة' })).toBeVisible();
    const afterPay = await snapshotDemo(page);
    expect(afterPay.transactions).toHaveLength(before.transactions.length + 1);
    expect(afterPay.allocations).toHaveLength(before.allocations.length + 1);
    expect(afterPay.dues.find(d => d.id === due.id)?.settledAmountMinor).toBe(5025);
    expect(afterPay.allocations.find(a => a.dueItemId === due.id)?.amountMinor).toBe(5025);
    expect(afterPay.transactions.filter(t => t.id === afterPay.allocations.find(a => a.dueItemId === due.id)?.paymentTransactionId)).toHaveLength(1);

    await row.getByRole('button', { name: 'تذكير', exact: true }).click();
    await row.getByRole('button', { name: 'حفظ ملاحظة تذكير تاريخية' }).click();
    await row.getByRole('button', { name: 'حفظ ملاحظة تذكير تاريخية' }).click();
  await row.getByRole('button', { name: 'تأكيد حفظ التذكير' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'تم حفظ التذكير' })).toBeVisible();
    const afterReminder = await snapshotDemo(page);
    expect(afterReminder.reminders).toHaveLength(before.reminders.length + 1);
    await page.reload();
    if (page.viewportSize()!.width < 1024) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'الاستحقاقات والتذكيرات' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'متابعة الاستحقاقات والتذكيرات' })).toBeVisible();
    await expect(page.locator('article').filter({ hasText: '2026-12-30' })).toContainText('100.00');
  });
}


test('N2: deleting unpaid due removes reminders without financial movements', async ({ page }) => {
  await openDemoDues(page);
  const before = await snapshotDemo(page);
  const add = page.locator('form').filter({ has: page.getByRole('button', { name: 'حفظ موعد الاستحقاق' }) });
  await add.locator('select').nth(0).selectOption('demo-acc-1');
  await add.getByPlaceholder('مثال: 500.00').fill('20.00');
  await add.locator('input[type="date"]').fill('2026-12-20');
  await add.getByRole('button', { name: 'حفظ موعد الاستحقاق' }).click();
  const row = page.locator('article').filter({ hasText: '2026-12-20' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'تذكير', exact: true }).click();
  await row.getByRole('button', { name: 'حفظ ملاحظة تذكير تاريخية' }).click();
  await row.getByRole('button', { name: 'تأكيد حفظ التذكير' }).click();
  expect((await snapshotDemo(page)).reminders).toHaveLength(before.reminders.length + 1);
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'حذف الاستحقاق' }).click();
  await expect(row).toHaveCount(0);
  const after = await snapshotDemo(page);
  expect(after.dues).toHaveLength(before.dues.length);
  expect(after.reminders).toHaveLength(before.reminders.length);
  expect(after.transactions).toHaveLength(before.transactions.length);
  expect(after.allocations).toHaveLength(before.allocations.length);
});
