import { expect, test } from '@playwright/test';

test('inter-account transfer can be created, edited and deleted in isolated demo workspace', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  await expect(page.getByText('وضع المعاينة التجريبية')).toBeVisible();

  const isMobile = page.viewportSize()!.width < 1024;
  if (isMobile) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'دليل الحسابات', exact: true }).click();
    await page.getByRole('button', { name: 'حركة بينية (نقل مديونية)', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'حركة بينية', exact: true }).click();
  }
  const form = page.locator('form').filter({ hasText: 'المبلغ المراد نقله' });
  await expect(form).toBeVisible();
  await form.locator('select').nth(0).selectOption('demo-acc-1');
  await form.locator('select').nth(1).selectOption('demo-acc-4');
  await form.getByPlaceholder('مثال: 500.00').fill('100.00');
  await form.getByPlaceholder('مثال: حوالة دين / تفويض سداد').fill('اختبار متصفح لنقل المديونية');
  await form.getByRole('button', { name: 'تأكيد وحفظ الحركة البينية' }).click();
  await expect(form).toBeHidden();

  if (isMobile) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  }
  await page.getByRole('navigation').getByRole('button', { name: 'دفتر الحركات', exact: true }).click();
  const transferRows = page.locator('tr').filter({ hasText: 'اختبار متصفح لنقل المديونية' });
  await expect(transferRows).toHaveCount(2);

  await transferRows.first().locator('button[title="تعديل الحركة البينية لكلا الطرفين"]').click();
  const editForm = page.locator('form').filter({ hasText: 'المبلغ المراد نقله' });
  await editForm.getByPlaceholder('مثال: 500.00').fill('80.00');
  await editForm.getByRole('button', { name: 'تحديث الحركة البينية' }).click();
  await expect(editForm).toBeHidden();
  await expect(transferRows).toHaveCount(2);

  await transferRows.first().locator('button[title="حذف الحركة البينية لكلا الطرفين"]').click();
  await page.getByRole('button', { name: 'حذف طرفي الحركة معاً' }).click();
  await expect(transferRows).toHaveCount(0);
});

test('account-private notes only appear in account details, not account search', async ({ page }) => {
  await page.goto('/');
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  }
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'دليل الحسابات', exact: true }).click();

  const secret = 'ملاحظة-خصوصية-للاختبار-التفاعلي-2026';
  await page.locator('button[title="تفاصيل الحساب والملاحظات الخاصة"]').first().click();
  await expect(page.getByText('ملاحظات الحساب الخاصة (سرية):')).toBeVisible();
  await page.getByPlaceholder('اكتب ملاحظات خاصة وسرية حول هذا الطرف أو شروط الاتفاق معه...').fill(secret);
  await page.getByRole('button', { name: 'حفظ الملاحظات الخاصة' }).click();
  await expect(page.getByText('تم حفظ الملاحظات')).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click();

  const search = page.getByPlaceholder('البحث بالاسم أو رقم الهاتف...');
  await search.fill(secret);
  await expect(page.getByText('لا توجد حسابات مطابقة للمحددات الحالية.')).toBeVisible();
  await search.fill('أحمد الشمري');
  await expect(page.getByText('أحمد الشمري')).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(3);
});
