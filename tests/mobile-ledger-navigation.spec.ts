import { expect, test } from '@playwright/test';

test('mobile statement and transactions show readable descriptions; bottom navigation and theme work', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'Mobile-only layout test');
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  if (await setup.isVisible()) {
    await setup.click();
    await expect(setup).toBeHidden();
  }
  await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  // Selecting a data scope leaves the drawer open; navigate once to dismiss it.
  await page.getByRole('navigation').getByRole('button', { name: 'لوحة التحكم', exact: true }).click();

  const toolbar = page.getByRole('toolbar', { name: 'التنقل السفلي للجوال' });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'الحركات' }).click();
  const txCard = page.getByTestId('mobile-transaction-card').first();
  await expect(txCard).toBeVisible();
  await expect(txCard.locator('article')).toHaveCount(0);
  await expect(page.getByTestId('mobile-transactions-list')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(4);

  await toolbar.getByRole('button', { name: 'كشف حساب' }).click();
  await expect(page.getByTestId('mobile-statement-list')).toBeVisible();
  const statementCard = page.getByTestId('mobile-statement-card').first();
  await expect(statementCard).toBeVisible();
  await expect(statementCard.locator('button')).not.toBeEmpty();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThan(4);

  const toggle = toolbar.getByRole('button', { name: /تفعيل الوضع/ });
  const initial = await page.locator('html').getAttribute('class');
  await toggle.click();
  const changed = await page.locator('html').getAttribute('class');
  expect(initial?.includes('dark')).not.toBe(changed?.includes('dark'));

  await toolbar.getByRole('button', { name: 'المزيد من عناصر القائمة' }).click();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'الاستحقاقات والتذكيرات' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'الصفحة الشخصية للمصمم عبدالله المخلافي' }))
    .toHaveAttribute('href', 'https://almkhlafi.carpetbazar.org/');
});
