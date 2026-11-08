import { expect, test } from '@playwright/test';

test('luxury glass theme is scoped to dark, persists and preserves light mode', async ({ page }) => {
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  if (await setup.isVisible()) {
    await setup.click();
    await expect(setup).toBeHidden();
  }

  const mobile = page.viewportSize()!.width < 1024;
  const openMenu = async () => {
    if (mobile) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  };
  await openMenu();
  const toggle = page.getByTitle('تبديل المظهر');
  if (await toggle.getByText('الوضع الزجاجي').isVisible()) await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(() => page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage))
    .toContain('luxury-emerald-marble.svg');
  await expect(page.locator('.luxury-dashboard .luxury-summary-card')).toHaveCount(3);
  const card = page.locator('.luxury-summary-card').first();
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).backgroundImage))
    .toContain('gradient');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  const lightBackground = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundImage);
  expect(lightBackground).not.toContain('luxury-emerald-marble.svg');

  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await openMenu();
  await page.getByTitle('تبديل المظهر').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});
