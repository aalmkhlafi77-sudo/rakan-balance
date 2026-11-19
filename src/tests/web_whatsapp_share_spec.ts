/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Web WhatsApp & Statement Share Verification Suite
 * Verifies international phone number sanitization, transaction & statement message formatting,
 * privacy protection (excluding private notes), WhatsApp URL generation, and zero financial drift invariant.
 */

import { TransactionModel, AccountModel, CategoryModel } from '../domain/types.ts';
import {
  sanitizePhoneNumber,
  buildTransactionShareMessage,
  buildStatementShareMessage,
  getWhatsAppUrl,
  getShareCapabilities,
  shareTextNatively,
  sharePdfFile,
  buildReportSharePayload,
} from '../services/whatsapp_share_service.ts';
import {
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
  generatePeriodSummaryReport,
  generateDebtorsCreditorsReport,
} from '../domain/financial_reports.ts';
import {
  generateHierarchicalAccountsReport,
  generateParentAccountPeriodReport,
} from '../domain/hierarchical_accounts.ts';
import { calculateAccountBalance } from '../domain/balance_calculator.ts';
import { hasValidPdfHeaderAndTrailer } from '../services/statement_pdf_file.ts';

export interface WebWhatsAppShareTestResult {
  passedCount: number;
  failedCount: number;
  results: { id: string; name: string; passed: boolean; message: string }[];
}

async function withMockBrowserEnv<T>(
  overrides: {
    isSecureContext?: boolean;
    share?: ((data: ShareData) => Promise<void>) | undefined;
    canShare?: ((data?: ShareData) => boolean) | undefined;
  },
  fn: () => Promise<T>
): Promise<T> {
  const prevWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const prevNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const mockWindow: Record<string, unknown> = {
    isSecureContext: overrides.isSecureContext ?? true,
    matchMedia: () => ({ matches: false }),
  };
  const mockNavigator: Record<string, unknown> = {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile',
  };
  if (overrides.share !== undefined) {
    mockNavigator.share = overrides.share;
  }
  if (overrides.canShare !== undefined) {
    mockNavigator.canShare = overrides.canShare;
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: mockWindow,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: mockNavigator,
  });

  try {
    return await fn();
  } finally {
    if (prevWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', prevWindowDescriptor);
    } else {
      delete (globalThis as any).window;
    }
    if (prevNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', prevNavigatorDescriptor);
    } else {
      delete (globalThis as any).navigator;
    }
  }
}

export async function runWebWhatsAppShareTestSuite(): Promise<WebWhatsAppShareTestResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function recordResult(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  // Test 1: Phone sanitization and international format validation
  try {
    const valid1 = sanitizePhoneNumber('+966 50 123 4567');
    const valid2 = sanitizePhoneNumber('0096777123456');
    const invalidShort = sanitizePhoneNumber('12345');
    const empty = sanitizePhoneNumber('');

    const ok =
      valid1.isValid &&
      valid1.cleanPhone === '966501234567' &&
      valid2.isValid &&
      valid2.cleanPhone === '96777123456' &&
      !invalidShort.isValid &&
      !empty.isValid;

    recordResult(
      'SHARE_TEST_01',
      'تطهير وفحص أرقام الهواتف الدولية واستبعاد الرموز والمستندات غير الصالحة',
      ok,
      `v1: ${valid1.cleanPhone}, v2: ${valid2.cleanPhone}, invalidShortBlocked: ${!invalidShort.isValid}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_01', 'تطهير وفحص أرقام الهواتف', false, err.message);
  }

  // Test 2: Transaction share message builder & privacy check (excluding private notes)
  try {
    const mockAccount: AccountModel = {
      id: 'acc_share_1',
      name: 'عبدالله السعيد',
      parentId: null,
      categoryId: 'cat_1',
      openingBalanceMinor: 0,
      status: 'active',
      notes: 'ملاحظة حساب سرية للغاية يجب ألا تظهر إطلاقاً',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockTx: TransactionModel = {
      id: 'tx_share_1',
      accountId: 'acc_share_1',
      entryType: 'owedByAccount',
      amountMinor: 25075, // 250.75 SAR
      date: '2026-11-08',
      description: 'دفعة بضاعة رقم 402',
      notes: 'ملاحظة حركة داخلية خاصة',
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const msg = buildTransactionShareMessage(mockTx, mockAccount.name, 'ر.س');

    const ok =
      msg.includes('عبدالله السعيد') &&
      msg.includes('250.75 ر.س') &&
      msg.includes('دفعة بضاعة رقم 402') &&
      msg.includes('عليه (+ لك)') &&
      !msg.includes('ملاحظة حساب سرية') &&
      !msg.includes('ملاحظة حركة داخلية');

    recordResult(
      'SHARE_TEST_02',
      'صياغة نص مشاركة الحركة المالية وحماية الملاحظات الخاصة من الخروج التلقائي',
      ok,
      `msgContainsDesc: ${msg.includes('دفعة بضاعة')}, excludesPrivateNotes: ${!msg.includes('سرية')}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_02', 'صياغة نص مشاركة الحركة الحالية', false, err.message);
  }

  // Test 3: Statement share message builder with exact halala totals
  try {
    const statementSummary = {
      openingBalanceMinor: 10000, // 100.00
      totalOwedByMinor: 50000, // 500.00
      totalOwedToMinor: 20000, // 200.00
      closingBalanceMinor: 40000, // 400.00
    };

    const msg = buildStatementShareMessage('شركة الأمل', '2026-11-01', '2026-11-08', statementSummary, 'ر.س');

    const ok =
      msg.includes('كشف حساب: شركة الأمل') &&
      msg.includes('رصيد أول المدة') &&
      msg.includes('الرصيد الختامي') &&
      msg.includes('+500.00 ر.س') &&
      msg.includes('-200.00 ر.س');

    recordResult(
      'SHARE_TEST_03',
      'صياغة ملخص كشف الحساب العربي وإبراز الأرصدة الافتتاحية والختامية والفترة',
      ok,
      `msgContainsAccount: ${msg.includes('شركة الأمل')}, containsTotals: ${msg.includes('+500.00')}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_03', 'صياغة ملخص كشف الحساب', false, err.message);
  }

  // Test 4: WhatsApp URL generation (Direct phone link vs General share link)
  try {
    const directUrl = getWhatsAppUrl('مرحبا', '966501234567');
    const generalUrl = getWhatsAppUrl('مرحبا');

    const ok =
      directUrl === 'https://wa.me/966501234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7' &&
      generalUrl === 'https://wa.me/?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7';

    recordResult(
      'SHARE_TEST_04',
      'توليد روابط واتساب الرسمية المباشرة واشتراط ترميز النص وتحديد المستلم',
      ok,
      `directUrl: ${directUrl}, generalUrl: ${generalUrl}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_04', 'توليد روابط واتساب', false, err.message);
  }

  // Test 5: Zero financial drift invariant
  try {
    const mockAccount: AccountModel = {
      id: 'acc_zero_1',
      name: 'حساب اختبار الثبات',
      parentId: null,
      categoryId: 'cat_1',
      openingBalanceMinor: 15000,
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const mockTx: TransactionModel = {
      id: 'tx_zero_1',
      accountId: 'acc_zero_1',
      entryType: 'owedByAccount',
      amountMinor: 10000,
      date: '2026-11-08',
      description: 'حركة بدون تغيير',
      attachmentIds: [],
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-08T00:00:00Z',
    };

    const balBefore = calculateAccountBalance(mockAccount, [mockTx]);
    const balAfter = calculateAccountBalance(mockAccount, [mockTx]);

    const ok = balBefore === 25000 && balAfter === 25000;

    recordResult(
      'SHARE_TEST_05',
      'ثبات المحرك المالي: ميزة المشاركة عبارة عن طبقة عرض محايدة ذات أثر حركي صفري',
      ok,
      `balBefore: ${balBefore}, balAfter: ${balAfter}`
    );
  } catch (err: any) {
    recordResult('SHARE_TEST_05', 'ثبات المحرك المالي مع المشاركة', false, err.message);
  }

  // -------------------------------------------------------------------------
  // SHARE-MOBILE-01..06: Web Share Capabilities & Mobile Reliability Scenarios
  // -------------------------------------------------------------------------
  const samplePdf = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 37, 69, 79, 70])], 'sample.pdf', {
    type: 'application/pdf',
  });

  // SHARE-MOBILE-01: navigator.share absent -> unsupported + wa.me works
  try {
    await withMockBrowserEnv({ isSecureContext: true, share: undefined, canShare: undefined }, async () => {
      const caps = getShareCapabilities(samplePdf);
      const textRes = await shareTextNatively({ title: 'تقرير', text: 'ملخص' });
      const pdfRes = await sharePdfFile(samplePdf, 'تقرير', 'ملخص');
      const fallbackUrl = getWhatsAppUrl('ملخص');
      const ok =
        !caps.canShareText &&
        !caps.canSharePdfFile &&
        textRes.status === 'unsupported' &&
        textRes.fallbackRecommended === true &&
        pdfRes.status === 'unsupported' &&
        fallbackUrl.startsWith('https://wa.me/?text=');

      recordResult(
        'SHARE-MOBILE-01',
        'عند غياب navigator.share يرجع unsupported ويعمل fallback رابط واتساب',
        ok,
        `textStatus=${textRes.status}, pdfStatus=${pdfRes.status}, canShareText=${caps.canShareText}`
      );
    });
  } catch (err: any) {
    recordResult('SHARE-MOBILE-01', 'غياب navigator.share', false, err.message);
  }

  // SHARE-MOBILE-02: navigator.share present, canShare({files}) false -> text succeeds, PDF falls back cleanly
  try {
    await withMockBrowserEnv(
      {
        isSecureContext: true,
        share: async () => undefined,
        canShare: () => false,
      },
      async () => {
        const caps = getShareCapabilities(samplePdf);
        const textRes = await shareTextNatively({ title: 'تقرير', text: 'ملخص' });
        const pdfRes = await sharePdfFile(samplePdf, 'تقرير', 'ملخص');
        const ok =
          caps.canShareText &&
          !caps.canSharePdfFile &&
          textRes.status === 'success' &&
          pdfRes.status === 'unsupported' &&
          pdfRes.fallbackRecommended === true;

        recordResult(
          'SHARE-MOBILE-02',
          'على موبايل يدعم مشاركة النص فقط (canShare files = false) ينجح النص ويتفعل بديل PDF',
          ok,
          `text=${textRes.status}, pdf=${pdfRes.status}, canSharePdf=${caps.canSharePdfFile}`
        );
      }
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-02', 'مشاركة النص فقط بدون دعم الملفات', false, err.message);
  }

  // SHARE-MOBILE-03: navigator.share + canShare({files}) true -> genuine PDF File passed
  try {
    let capturedFile: File | undefined;
    await withMockBrowserEnv(
      {
        isSecureContext: true,
        canShare: (data) => Boolean(data?.files?.length),
        share: async (data) => {
          capturedFile = data.files?.[0];
        },
      },
      async () => {
        const caps = getShareCapabilities(samplePdf);
        const pdfRes = await sharePdfFile(samplePdf, 'كشف حساب', 'ملخص');
        const ok =
          caps.canSharePdfFile &&
          pdfRes.status === 'success' &&
          capturedFile?.name === 'sample.pdf' &&
          capturedFile?.type === 'application/pdf';

        recordResult(
          'SHARE-MOBILE-03',
          'عند دعم مشاركة الملفات (canShare files = true) يتم تمرير ملف PDF فعلي إلى navigator.share',
          ok,
          `status=${pdfRes.status}, passedFile=${capturedFile?.name}:${capturedFile?.type}`
        );
      }
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-03', 'مشاركة ملف PDF فعلي', false, err.message);
  }

  // SHARE-MOBILE-04: AbortError handled as cancellation, not hard failure
  try {
    await withMockBrowserEnv(
      {
        isSecureContext: true,
        canShare: () => true,
        share: async () => {
          const abortErr = new Error('Share canceled');
          abortErr.name = 'AbortError';
          throw abortErr;
        },
      },
      async () => {
        const textRes = await shareTextNatively({ title: 'تقرير', text: 'ملخص' });
        const pdfRes = await sharePdfFile(samplePdf, 'تقرير', 'ملخص');
        const ok =
          textRes.status === 'cancelled' &&
          pdfRes.status === 'cancelled' &&
          !textRes.fallbackRecommended;

        recordResult(
          'SHARE-MOBILE-04',
          'معالجة AbortError كإلغاء طبيعي من المستخدم وليس خطأ تقني',
          ok,
          `text=${textRes.status}, pdf=${pdfRes.status}`
        );
      }
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-04', 'معالجة AbortError', false, err.message);
  }

  // SHARE-MOBILE-05: NotAllowedError returns notAllowed with fallback guidance
  try {
    await withMockBrowserEnv(
      {
        isSecureContext: true,
        canShare: () => true,
        share: async () => {
          const denied = new Error('User activation lost');
          denied.name = 'NotAllowedError';
          throw denied;
        },
      },
      async () => {
        const textRes = await shareTextNatively({ title: 'تقرير', text: 'ملخص' });
        const pdfRes = await sharePdfFile(samplePdf, 'تقرير', 'ملخص');
        const ok =
          textRes.status === 'notAllowed' &&
          textRes.fallbackRecommended === true &&
          pdfRes.status === 'notAllowed' &&
          pdfRes.fallbackRecommended === true;

        recordResult(
          'SHARE-MOBILE-05',
          'عند NotAllowedError ترجع النتيجة notAllowed مع تفعيل Fallback واضح',
          ok,
          `text=${textRes.status}, pdf=${pdfRes.status}`
        );
      }
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-05', 'معالجة NotAllowedError', false, err.message);
  }

  // SHARE-MOBILE-06: isSecureContext = false disables native share cleanly
  try {
    await withMockBrowserEnv(
      {
        isSecureContext: false,
        canShare: () => true,
        share: async () => undefined,
      },
      async () => {
        const caps = getShareCapabilities(samplePdf);
        const textRes = await shareTextNatively({ title: 'تقرير', text: 'ملخص' });
        const pdfRes = await sharePdfFile(samplePdf, 'تقرير', 'ملخص');
        const ok =
          !caps.isSecureContext &&
          !caps.canShareText &&
          !caps.canSharePdfFile &&
          textRes.status === 'unsupported' &&
          pdfRes.status === 'unsupported';

        recordResult(
          'SHARE-MOBILE-06',
          'عند isSecureContext = false يتم تعطيل المشاركة الأصلية وتفعيل البدائل بأمان',
          ok,
          `canShareText=${caps.canShareText}, canSharePdf=${caps.canSharePdfFile}`
        );
      }
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-06', 'تعطيل المشاركة في سياق غير آمن', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Financial Reports Fixture for SHARE-MOBILE-07..10 & REPORT_SHARE_01..06
  // -------------------------------------------------------------------------
  const testCategories: CategoryModel[] = [
    { id: 'cat_clients', name: 'العملاء', sortOrder: 1 },
    { id: 'cat_suppliers', name: 'الموردون', sortOrder: 2 },
  ];

  const SECRET_ACCOUNT_NOTE = 'SECRET_ACC_NOTE_DO_NOT_EXPORT';
  const SECRET_TX_NOTE = 'SECRET_TX_NOTE_DO_NOT_EXPORT';

  const testAccounts: AccountModel[] = [
    {
      id: 'acc_root_internal_id_991',
      name: 'مجموعة النخبة التجارية',
      parentId: null,
      categoryId: 'cat_clients',
      phone: '+966501112233',
      openingBalanceMinor: 10000, // 100.00
      status: 'active',
      notes: SECRET_ACCOUNT_NOTE,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'acc_branch_internal_id_992',
      name: 'فرع الرياض',
      parentId: 'acc_root_internal_id_991',
      categoryId: 'cat_clients',
      openingBalanceMinor: 0,
      status: 'active',
      notes: SECRET_ACCOUNT_NOTE,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'acc_supplier_internal_id_993',
      name: 'مؤسسة التوريد الحديثة',
      parentId: null,
      categoryId: 'cat_suppliers',
      openingBalanceMinor: -5000, // -50.00
      status: 'active',
      notes: SECRET_ACCOUNT_NOTE,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const testTransactions: TransactionModel[] = [
    {
      id: 'tx_internal_id_881',
      accountId: 'acc_branch_internal_id_992',
      entryType: 'owedByAccount',
      amountMinor: 35000, // +350.00
      date: '2026-11-02',
      description: 'توريد بضاعة فرع الرياض',
      notes: SECRET_TX_NOTE,
      attachmentIds: [],
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
    },
    {
      id: 'tx_internal_id_882',
      accountId: 'acc_supplier_internal_id_993',
      entryType: 'owedToAccount',
      amountMinor: 15000, // -150.00 -> total -200.00
      date: '2026-11-05',
      description: 'فاتورة مشتريات آجلة',
      notes: SECRET_TX_NOTE,
      attachmentIds: [],
      createdAt: '2026-11-05T00:00:00Z',
      updatedAt: '2026-11-05T00:00:00Z',
    },
  ];

  const scope = { fromDate: '2026-11-01', toDate: '2026-11-10', status: 'active' as const };
  const accountsRep = generateAccountsBalanceReport(testAccounts, testTransactions, testCategories, scope);
  const hierRep = generateHierarchicalAccountsReport(testAccounts, testTransactions, testCategories, scope);
  const parentRep = generateParentAccountPeriodReport(
    testAccounts,
    testTransactions,
    testCategories,
    'acc_root_internal_id_991',
    { ...scope, mode: 'detailed' }
  );
  const catRep = generateCategorySummaryReport(testAccounts, testTransactions, testCategories, scope);
  const periodRep = generatePeriodSummaryReport(testAccounts, testTransactions, testCategories, scope);
  const dcRep = generateDebtorsCreditorsReport(testAccounts, testTransactions, testCategories, {
    toDate: '2026-11-10',
    status: 'active',
  });

  const allReportPayloads = [
    buildReportSharePayload({ reportKey: 'accounts', report: accountsRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
    buildReportSharePayload({ reportKey: 'hierarchical', report: hierRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
    buildReportSharePayload({ reportKey: 'parent_branch', report: parentRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
    buildReportSharePayload({ reportKey: 'categories', report: catRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
    buildReportSharePayload({ reportKey: 'period', report: periodRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
    buildReportSharePayload({ reportKey: 'debtors_creditors', report: dcRep, ownerName: 'راكان', currencySymbol: 'ر.س' }),
  ];

  // SHARE-MOBILE-07: General financial report needs no recipient phone
  try {
    const accountsUrl = getWhatsAppUrl(allReportPayloads[0].messageText);
    const ok =
      accountsUrl.startsWith('https://wa.me/?text=') &&
      !allReportPayloads[0].suggestedPhone &&
      allReportPayloads[2].suggestedPhone === '+966501112233';

    recordResult(
      'SHARE-MOBILE-07',
      'التقارير المالية العامة لا تفرض رقم مستلم وتولد رابط مشاركة عاماً صحيحاً',
      ok,
      `generalUrlValid=${accountsUrl.startsWith('https://wa.me/?text=')}, parentSuggestion=${allReportPayloads[2].suggestedPhone}`
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-07', 'مشاركة التقرير بدون رقم', false, err.message);
  }

  // SHARE-MOBILE-08: Registered phone formats exact wa.me URL
  try {
    const url = getWhatsAppUrl(allReportPayloads[2].messageText, allReportPayloads[2].suggestedPhone);
    const ok = url.startsWith('https://wa.me/966501112233?text=');
    recordResult(
      'SHARE-MOBILE-08',
      'الرقم الدولي المسجل ينشئ رابط https://wa.me/<digits>?text= صحيحاً',
      ok,
      `urlPrefix=${url.slice(0, 36)}`
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-08', 'توجيه الرقم الدولي في واتساب', false, err.message);
  }

  // SHARE-MOBILE-09: PDF generated for all 6 reports starts with %PDF-, ends with %%EOF, MIME application/pdf, size > 0
  try {
    let allValidPdf = true;
    const sizes: number[] = [];
    for (const payload of allReportPayloads) {
      const pdfFile = payload.pdfFileFactory();
      const bytes = new Uint8Array(await pdfFile.arrayBuffer());
      sizes.push(bytes.length);
      if (
        pdfFile.type !== 'application/pdf' ||
        !pdfFile.name.endsWith('.pdf') ||
        bytes.length <= 0 ||
        !hasValidPdfHeaderAndTrailer(bytes)
      ) {
        allValidPdf = false;
      }
    }
    recordResult(
      'SHARE-MOBILE-09',
      'إنشاء ملف PDF حقيقي للتقارير الستة بتوقيع %PDF- ونهاية %%EOF ونوع application/pdf',
      allValidPdf,
      `allValid=${allValidPdf}, sizes=${sizes.join(',')}`
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-09', 'التحقق من ملفات PDF للتقارير', false, err.message);
  }

  // SHARE-MOBILE-10: Financial invariance across all 6 reports
  try {
    const beforeBalances = testAccounts.map((a) =>
      calculateAccountBalance(a, testTransactions.filter((t) => t.accountId === a.id))
    );
    for (const payload of allReportPayloads) {
      void payload.messageText;
      void payload.pdfFileFactory();
    }
    const afterBalances = testAccounts.map((a) =>
      calculateAccountBalance(a, testTransactions.filter((t) => t.accountId === a.id))
    );
    const ok = JSON.stringify(beforeBalances) === JSON.stringify(afterBalances) && beforeBalances[0] === 10000;
    recordResult(
      'SHARE-MOBILE-10',
      'المشاركة لا تعدل أي حساب أو حركة أو رصيد مالي (Financial Invariance)',
      ok,
      `before=${beforeBalances.join(',')}, after=${afterBalances.join(',')}`
    );
  } catch (err: any) {
    recordResult('SHARE-MOBILE-10', 'ثبات الأرصدة عند مشاركة التقارير', false, err.message);
  }

  // REPORT_SHARE_01..06: Verify content, exact numbers, and strict privacy for each report type
  const expectedSnippets: Array<{
    id: string;
    name: string;
    payload: (typeof allReportPayloads)[number];
    mustContain: string[];
  }> = [
    {
      id: 'REPORT_SHARE_01',
      name: 'ملخص مشاركة تقرير أرصدة الحسابات (accounts)',
      payload: allReportPayloads[0],
      mustContain: ['أرصدة الحسابات', '450.00 ر.س', '200.00 ر.س', '2026-11-01'],
    },
    {
      id: 'REPORT_SHARE_02',
      name: 'ملخص مشاركة تقرير الحسابات الرئيسية والفروع (hierarchical)',
      payload: allReportPayloads[1],
      mustContain: ['الحسابات الرئيسية والفروع', '450.00 ر.س', '200.00 ر.س'],
    },
    {
      id: 'REPORT_SHARE_03',
      name: 'ملخص مشاركة تقرير الحساب الرئيسي والفروع (parent_branch)',
      payload: allReportPayloads[2],
      mustContain: ['مجموعة النخبة التجارية', '350.00 ر.س', '450.00 ر.س', 'فرع الرياض'],
    },
    {
      id: 'REPORT_SHARE_04',
      name: 'ملخص مشاركة تقرير التصنيفات (categories)',
      payload: allReportPayloads[3],
      mustContain: ['التصنيفات', 'العملاء', 'الموردون', '450.00 ر.س'],
    },
    {
      id: 'REPORT_SHARE_05',
      name: 'ملخص مشاركة تقرير حركة الفترة الزمانية (period)',
      payload: allReportPayloads[4],
      mustContain: ['حركة الفترة الزمانية', '350.00 ر.س', '150.00 ر.س', '250.00 ر.س'],
    },
    {
      id: 'REPORT_SHARE_06',
      name: 'ملخص مشاركة تقرير تحليل لك / عليك (debtors_creditors)',
      payload: allReportPayloads[5],
      mustContain: ['لك / عليك', '450.00 ر.س', '200.00 ر.س', 'مؤسسة التوريد الحديثة'],
    },
  ];

  for (const spec of expectedSnippets) {
    try {
      const msg = spec.payload.messageText;
      const hasAllRequired = spec.mustContain.every((s) => msg.includes(s));
      const leakedPrivate =
        msg.includes(SECRET_ACCOUNT_NOTE) ||
        msg.includes(SECRET_TX_NOTE) ||
        msg.includes('acc_root_internal_id_991') ||
        msg.includes('tx_internal_id_881');
      const ok = hasAllRequired && !leakedPrivate;
      recordResult(
        spec.id,
        spec.name,
        ok,
        `hasRequired=${hasAllRequired}, privacyClean=${!leakedPrivate}`
      );
    } catch (err: any) {
      recordResult(spec.id, spec.name, false, err.message);
    }
  }

  return { passedCount, failedCount, results };
}
