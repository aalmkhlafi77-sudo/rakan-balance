import { expect, test } from '@playwright/test';

test('approved RAKAN BALANCE brand images load on desktop and mobile', async ({ page }, info) => {
  for (const path of [
    '/assets/rakan-logo.webp',
    '/assets/rakan-icon-192.webp',
    '/assets/rakan-icon-512.webp',
    '/apple-touch-icon.png',
  ]) {
    const response = await page.request.get(path);
    expect(response.ok(), `Missing brand asset: ${path}`).toBeTruthy();
    expect((await response.body()).length).toBeGreaterThan(1000);
  }

  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
    '/assets/rakan-icon-192.webp',
    '/assets/rakan-icon-512.webp',
  ]);

  await page.goto('/');
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  if (await setup.isVisible()) {
    await setup.click();
    await expect(setup).toBeHidden();
  }

  const logo = page.locator('.luxury-sidebar img[alt="راكان بلانس — RAKAN BALANCE"]');
  await expect(logo).toHaveCount(1);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const mobile = info.project.name.startsWith('mobile');
  if (mobile) {
    const icon = page.locator('.luxury-navbar img[src="/assets/rakan-icon-192.webp"]');
    await expect(icon).toBeVisible();
    await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
    await expect(logo).toBeVisible();
  } else {
    await expect(logo).toBeVisible();
  }

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/assets/rakan-icon-192.webp');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
});
