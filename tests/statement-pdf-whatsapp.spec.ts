import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openStatement(page: import('@playwright/test').Page) {
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  if (await setup.isVisible()) {
    await setup.click();
    await expect(setup).toBeHidden();
  }
  const mobile = page.viewportSize()!.width < 1024;
  if (mobile) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  await expect(page.getByText('وضع المعاينة التجريبية')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'كشف الحساب التفصيلي' }).click();
  await page.getByRole('button', { name: 'مشاركة واتساب' }).click();
  await expect(page.getByRole('button', { name: 'مشاركة / تنزيل PDF' })).toBeVisible();
}

test('desktop: produce a real downloadable PDF with valid header and trailer', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Desktop download fallback only');
  await openStatement(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'مشاركة / تنزيل PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^statement_.*\.pdf$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(bytes.toString('latin1').trimEnd().endsWith('%%EOF')).toBeTruthy();
  expect(bytes.length).toBeGreaterThan(3000);
  await expect(page.getByRole('status').filter({ hasText: 'تم تنزيل كشف PDF' })).toBeVisible();
});

test('mobile emulation: native share receives a genuine PDF File', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'Mobile browser emulation only');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { files?: File[] }) => {
        const file = data.files?.[0];
        if (!file) throw new Error('No PDF file was passed');
        const bytes = new Uint8Array(await file.arrayBuffer());
        (window as any).__pdfShare = {
          filename: file.name,
          type: file.type,
          header: String.fromCharCode(...bytes.slice(0, 8)),
          hasEof: new TextDecoder().decode(bytes.slice(-16)).includes('%%EOF'),
          size: bytes.length,
        };
      },
    });
  });
  await openStatement(page);
  await page.getByRole('button', { name: 'مشاركة / تنزيل PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__pdfShare)).toBeTruthy();
  const infoFile = await page.evaluate(() => (window as any).__pdfShare);
  expect(infoFile.type).toBe('application/pdf');
  expect(infoFile.header).toBe('%PDF-1.4');
  expect(infoFile.hasEof).toBeTruthy();
  expect(infoFile.size).toBeGreaterThan(3000);
  await expect(page.getByRole('status').filter({ hasText: 'تم تسليم الملف' })).toBeVisible();
});

test('recipient: no stored number must not silently choose general sharing', async ({ page }) => {
  await openStatement(page);
  await expect(page.getByText('لا يوجد رقم محفوظ لهذا الطرف.')).toBeVisible();
  await expect(page.getByRole('link', { name: /أدخل رقم مستلم صحيحًا/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByPlaceholder('إدخال رقم واتساب دولي (مثال: 966501234567)').fill('+966 50 123 4567');
  const link = page.getByRole('link', { name: /فتح محادثة واتساب/ });
  await expect(link).toHaveAttribute('href', /https:\/\/wa\.me\/966501234567\?text=/);
});
