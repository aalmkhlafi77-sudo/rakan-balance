import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function enterDemoMode(page: import('@playwright/test').Page) {
  await page.goto('/');
  const setup = page.getByRole('button', { name: 'بدء استخدام راكان بلانس' });
  try {
    await setup.waitFor({ state: 'visible', timeout: 3000 });
    await setup.click();
    await expect(setup).toBeHidden();
  } catch {
    // Already dismissed or not first launch
  }
  const mobile = page.viewportSize()!.width < 1024;
  if (mobile) await page.getByRole('button', { name: 'القائمة الرئيسية' }).click();
  await page.getByRole('button', { name: 'بيانات المعاينة' }).click();
  await expect(page.getByText('وضع المعاينة التجريبية')).toBeVisible();
}

async function openStatement(page: import('@playwright/test').Page) {
  await enterDemoMode(page);
  await page.getByRole('navigation').getByRole('button', { name: 'كشف الحساب التفصيلي' }).click();
  await page.getByRole('button', { name: 'مشاركة واتساب' }).click();
}

async function openReports(page: import('@playwright/test').Page) {
  await enterDemoMode(page);
  await page.getByRole('navigation').getByRole('button', { name: 'التقارير التحليلية والتصدير' }).click();
  await expect(page.getByText('التقارير المالية والتحليلية المتقدمة')).toBeVisible();
}

test('desktop: statement produces a real downloadable PDF with honest fallback UI', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('desktop'), 'Desktop download fallback only');
  await openStatement(page);
  await expect(page.getByText('هذا المتصفح لا يدعم مشاركة ملفات PDF مباشرة.')).toBeVisible();
  const pdfBtn = page.getByRole('button', { name: 'تنزيل PDF' });
  await expect(pdfBtn).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await pdfBtn.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^statement_.*\.pdf$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(bytes.toString('latin1').trimEnd().endsWith('%%EOF')).toBeTruthy();
  expect(bytes.length).toBeGreaterThan(3000);
  await expect(page.getByRole('status').filter({ hasText: 'تم تنزيل كشف PDF' })).toBeVisible();
});

test('mobile emulation: native share receives a genuine PDF File and keeps direct wa.me open cleanly', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'Mobile browser emulation only');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { files?: File[]; text?: string; title?: string }) => {
        const file = data.files?.[0];
        if (file) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          (window as any).__pdfShare = {
            filename: file.name,
            type: file.type,
            header: String.fromCharCode(...bytes.slice(0, 8)),
            hasEof: new TextDecoder().decode(bytes.slice(-16)).includes('%%EOF'),
            size: bytes.length,
          };
        } else {
          (window as any).__textShare = { title: data.title, text: data.text };
        }
      },
    });
  });
  await openStatement(page);
  await expect(page.getByRole('button', { name: 'مشاركة النص عبر الجهاز' })).toBeVisible();
  const sharePdfBtn = page.getByRole('button', { name: 'مشاركة PDF عبر الجهاز' });
  await expect(sharePdfBtn).toBeVisible();
  await sharePdfBtn.click();
  await expect.poll(() => page.evaluate(() => (window as any).__pdfShare)).toBeTruthy();
  const infoFile = await page.evaluate(() => (window as any).__pdfShare);
  expect(infoFile.type).toBe('application/pdf');
  expect(infoFile.header).toBe('%PDF-1.4');
  expect(infoFile.hasEof).toBeTruthy();
  expect(infoFile.size).toBeGreaterThan(3000);
  await expect(page.getByRole('status').filter({ hasText: 'تم تسليم الملف' })).toBeVisible();

  await page.getByRole('button', { name: 'مشاركة النص عبر الجهاز' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__textShare)).toBeTruthy();
});

test('mobile emulation: text-only Web Share does NOT falsely advertise native PDF file share', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'Mobile browser emulation only');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: { text?: string }) => {
        (window as any).__textOnlyShared = data.text;
      },
    });
  });
  await openStatement(page);
  await expect(page.getByRole('button', { name: 'مشاركة PDF عبر الجهاز' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'تنزيل PDF' })).toBeVisible();
  await expect(page.getByText('هذا المتصفح لا يدعم مشاركة ملفات PDF مباشرة.')).toBeVisible();
  await page.getByRole('button', { name: 'مشاركة النص عبر الجهاز' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__textOnlyShared)).toBeTruthy();
});

test('mobile emulation: NotAllowedError falls back to download and keeps modal open', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('mobile'), 'Mobile browser emulation only');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        const err = new Error('User activation expired');
        err.name = 'NotAllowedError';
        throw err;
      },
    });
  });
  await openStatement(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'مشاركة PDF عبر الجهاز' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^statement_.*\.pdf$/);
  await expect(page.getByRole('status').filter({ hasText: 'NotAllowedError' })).toBeVisible();
});

test('recipient: no stored number must not silently choose general sharing for statements', async ({ page }) => {
  await openStatement(page);
  await expect(page.getByText('الرقم المسجل غير مكتمل دوليًا.')).toBeVisible();
  await expect(page.getByRole('link', { name: /أدخل رقم مستلم صحيحًا/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByPlaceholder('إدخال رقم واتساب دولي (مثال: 966501234567)').fill('+966 50 123 4567');
  const link = page.getByRole('link', { name: /فتح محادثة واتساب/ });
  await expect(link).toHaveAttribute('href', /https:\/\/wa\.me\/966501234567\?text=/);
});

test('desktop & mobile: financial reports share modal works without requiring a phone number', async ({ page }, info) => {
  const isMobile = info.project.name.startsWith('mobile');
  if (isMobile) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          const file = data.files?.[0];
          if (file) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            (window as any).__reportPdf = {
              name: file.name,
              type: file.type,
              header: String.fromCharCode(...bytes.slice(0, 8)),
              hasEof: new TextDecoder().decode(bytes.slice(-16)).includes('%%EOF'),
            };
          }
        },
      });
    });
  }

  await openReports(page);
  await page.getByRole('button', { name: 'مشاركة واتساب' }).click();

  // General mode active by default: direct WhatsApp link enabled without phone number
  await expect(page.getByText('مشاركة عامة بدون رقم', { exact: true })).toBeVisible();
  const waLink = page.getByRole('link', { name: 'فتح واتساب للمشاركة العامة' });
  await expect(waLink).toHaveAttribute('href', /https:\/\/wa\.me\/\?text=/);

  if (isMobile) {
    await page.getByRole('button', { name: 'مشاركة PDF عبر الجهاز' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__reportPdf)).toBeTruthy();
    const rep = await page.evaluate(() => (window as any).__reportPdf);
    expect(rep.name).toMatch(/^report_accounts_.*\.pdf$/);
    expect(rep.type).toBe('application/pdf');
    expect(rep.header).toBe('%PDF-1.4');
    expect(rep.hasEof).toBeTruthy();
  } else {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'تنزيل PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^report_accounts_.*\.pdf$/);
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(bytes.toString('latin1').trimEnd().endsWith('%%EOF')).toBeTruthy();
  }

  // Close modal and test switching to Categories report tab
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: 'تجميع التصنيفات' }).click();
  await page.getByRole('button', { name: 'مشاركة واتساب' }).click();
  await expect(page.getByText('تقرير توزيع الأرصدة حسب التصنيفات').first()).toBeVisible();
});
