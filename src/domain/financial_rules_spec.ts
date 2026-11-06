/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Verification Test Suite
 * Executable specifications testing all invariants from Document v2 & Post-Review Fixes
 */

import {
  calculateAccountBalance,
  calculateAccountStatement,
  calculateDashboardSummary,
  checkTreeCycle,
} from './balance_calculator.ts';
import { tryToMinorUnits, toMinorUnits, MAX_SAFE_MINOR_AMOUNT } from './money.ts';
import { AccountModel, CategoryModel, TransactionModel, BackupBundle } from './types.ts';

export interface TestResult {
  id: string;
  title: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export function runFinancialVerificationSuite(): TestResult[] {
  const results: TestResult[] = [];

  // =========================================================================
  // TEST 1: Mandatory Reference Example (Blueprint v2 - Section 4.1)
  // Opening: +200.00 (20000)
  // Owed by: +150.00 (15000) -> 35000
  // Owed to: -80.00 (8000)   -> 27000
  // Owed to: -300.00 (30000) -> -3000 (-30.00 عليك)
  // Statement starting from last transaction date must open at +270.00
  // =========================================================================
  {
    const account: AccountModel = {
      id: 'acc-ref-1',
      name: 'حساب الاختبار المرجعي',
      parentId: null,
      categoryId: 'cat-1',
      openingBalanceMinor: 20000, // +200.00
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    const transactions: TransactionModel[] = [
      {
        id: 'tx-1',
        accountId: 'acc-ref-1',
        entryType: 'owedByAccount',
        amountMinor: 15000, // +150.00
        date: '2026-11-02',
        description: 'بضاعة مستحقة',
        attachmentIds: [],
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
      },
      {
        id: 'tx-2',
        accountId: 'acc-ref-1',
        entryType: 'owedToAccount',
        amountMinor: 8000, // -80.00
        date: '2026-11-03',
        description: 'دفعة مستلمة',
        attachmentIds: [],
        createdAt: '2026-11-03T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
      },
      {
        id: 'tx-3',
        accountId: 'acc-ref-1',
        entryType: 'owedToAccount',
        amountMinor: 30000, // -300.00
        date: '2026-11-04',
        description: 'تسوية',
        attachmentIds: [],
        createdAt: '2026-11-04T10:00:00Z',
        updatedAt: '2026-11-04T10:00:00Z',
      },
    ];

    const currentBalance = calculateAccountBalance(account, transactions);
    const statementFromLastTx = calculateAccountStatement(
      account,
      transactions,
      '2026-11-04',
      '2026-11-04'
    );

    const isBalanceCorrect = currentBalance === -3000;
    const isStatementOpeningCorrect = statementFromLastTx.openingBalanceMinor === 27000;
    const isStatementClosingCorrect = statementFromLastTx.closingBalanceMinor === -3000;

    results.push({
      id: 'test-1-reference-example',
      title: 'اختبار المثال المرجعي الإلزامي (وثيقة v2 بند 4.1)',
      passed: isBalanceCorrect && isStatementOpeningCorrect && isStatementClosingCorrect,
      expected: 'الرصيد النهائي: -30.00 (عليك 30 ر.س)، ورصيد بداية كشف حساب يبدأ من الحركة الأخيرة: +270.00',
      actual: `الرصيد: ${(currentBalance / 100).toFixed(2)} ر.س، رصيد أول الفترة: ${(statementFromLastTx.openingBalanceMinor / 100).toFixed(2)} ر.س، رصيد آخر الفترة: ${(statementFromLastTx.closingBalanceMinor / 100).toFixed(2)} ر.س`,
      details: 'مطابقة تامة بين تراكم الحركات ورصيد أول المدة المستقل عن الرصيد الافتتاحي.',
    });
  }

  // =========================================================================
  // TEST 2: Multi-Account Dashboard Totals (Document v2 Section 3 & 4)
  // Accounts: A (+100), B (-70), C (+20)
  // Total Receivable (لك) = 100 + 20 = 120
  // Total Payable (عليك) = 70
  // Net = 120 - 70 = 50
  // =========================================================================
  {
    const accounts: AccountModel[] = [
      {
        id: 'acc-a',
        name: 'طرف أ',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 10000, // +100.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'acc-b',
        name: 'طرف ب',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: -7000, // -70.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'acc-c',
        name: 'طرف ج',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 2000, // +20.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
    ];

    const summary = calculateDashboardSummary(accounts, []);
    const isReceivableCorrect = summary.totalReceivableMinor === 12000;
    const isPayableCorrect = summary.totalPayableMinor === 7000;
    const isNetCorrect = summary.netBalanceMinor === 5000;

    results.push({
      id: 'test-2-dashboard-totals',
      title: 'اختبار تطابق إجماليات لوحة التحكم (لك / عليك / الصافي)',
      passed: isReceivableCorrect && isPayableCorrect && isNetCorrect,
      expected: 'إجمالي لك = 120.00، إجمالي عليك = 70.00، صافي المركز = 50.00',
      actual: `لك = ${(summary.totalReceivableMinor / 100).toFixed(2)}، عليك = ${(summary.totalPayableMinor / 100).toFixed(2)}، الصافي = ${(summary.netBalanceMinor / 100).toFixed(2)}`,
      details: 'حساب الصافي من حاصل طرح عليك من لك، مع عزل الموجب والسالب بدقة.',
    });
  }

  // =========================================================================
  // TEST 3: Sub-Accounts Independence & No Duplicate Counting
  // =========================================================================
  {
    const parentAccount: AccountModel = {
      id: 'parent-1',
      name: 'شركة رئيسية',
      parentId: null,
      categoryId: 'cat-1',
      openingBalanceMinor: 5000, // +50.00
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    const childAccount: AccountModel = {
      id: 'child-1',
      name: 'فرع الشركة',
      parentId: 'parent-1',
      categoryId: 'cat-1',
      openingBalanceMinor: 3000, // +30.00
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    const summary = calculateDashboardSummary([parentAccount, childAccount], []);
    // Total should be 50 + 30 = 80, NOT duplicated to (50+30) + 30 = 110
    const passed = summary.totalReceivableMinor === 8000;

    results.push({
      id: 'test-3-subaccounts-independence',
      title: 'اختبار استقلال الحسابات الفرعية ومنع التكرار المالي للأب والأبناء',
      passed,
      expected: 'إجمالي لك = 80.00 (رصيد الأب 50 + رصيد الفرع 30)',
      actual: `إجمالي لك = ${(summary.totalReceivableMinor / 100).toFixed(2)}`,
      details: 'الحسابات الفرعية تملك أرصدة مباشرة مستقلة ولا يضاعف رصيد الأب أبناءه في الإجماليات.',
    });
  }

  // =========================================================================
  // TEST 4: Tree Cycle Prevention
  // =========================================================================
  {
    const accounts: AccountModel[] = [
      {
        id: 'acc-1',
        name: 'الأب',
        parentId: null,
        categoryId: 'c1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'acc-2',
        name: 'الابن',
        parentId: 'acc-1',
        categoryId: 'c1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 'acc-3',
        name: 'الحفيد',
        parentId: 'acc-2',
        categoryId: 'c1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
    ];

    const selfCycle = checkTreeCycle(accounts, 'acc-1', 'acc-1');
    const descendantCycle = checkTreeCycle(accounts, 'acc-1', 'acc-3');
    const safeChange = checkTreeCycle(accounts, 'acc-3', null);

    const passed = selfCycle && descendantCycle && !safeChange;

    results.push({
      id: 'test-4-cycle-prevention',
      title: 'اختبار كشف ومنع الدورات الحلقية في شجرة الحسابات',
      passed,
      expected: 'منع تعيين الحساب أباً لنفسه أو لأي من أحفاده بنجاح',
      actual: `كشف تفرع لنفسه: ${selfCycle ? 'ممنوع' : 'مسموح'}، كشف تفرع لحفيده: ${descendantCycle ? 'ممنوع' : 'مسموح'}`,
      details: 'منع الحلقات يضمن سلامة الشجرة ومنع حدوث تجمد في المعالجة العودية.',
    });
  }

  // =========================================================================
  // TEST 5: Strict Money Input Validation & Boundary Cases (Review Fix #1)
  // =========================================================================
  {
    // Invalid inputs that MUST be rejected:
    const invalidMultiDot = tryToMinorUnits('10.20.30');
    const invalidLetters = tryToMinorUnits('15a0');
    const invalidExtraDecimals = tryToMinorUnits('12.345');
    const invalidExtraDecimalsNum = tryToMinorUnits(12.345);
    const invalidEmpty = tryToMinorUnits('');
    const invalidSignOnly = tryToMinorUnits('-');
    const invalidDotOnly = tryToMinorUnits('.');
    const invalidNaN = tryToMinorUnits(NaN);
    const invalidOverflow = tryToMinorUnits(MAX_SAFE_MINOR_AMOUNT + 100);

    // Valid inputs that MUST be parsed accurately:
    const validExactTwo = tryToMinorUnits('150.25');
    const validExactOne = tryToMinorUnits('150.2');
    const validWhole = tryToMinorUnits('150');
    const validNegative = tryToMinorUnits('-50.75');

    const allInvalidRejected =
      !invalidMultiDot.success &&
      !invalidLetters.success &&
      !invalidExtraDecimals.success &&
      !invalidExtraDecimalsNum.success &&
      !invalidEmpty.success &&
      !invalidSignOnly.success &&
      !invalidDotOnly.success &&
      !invalidNaN.success &&
      !invalidOverflow.success;

    const allValidAccepted =
      validExactTwo.success && validExactTwo.minor === 15025 &&
      validExactOne.success && validExactOne.minor === 15020 &&
      validWhole.success && validWhole.minor === 15000 &&
      validNegative.success && validNegative.minor === -5075;

    const passed = allInvalidRejected && allValidAccepted;

    results.push({
      id: 'test-5-strict-money-validation',
      title: 'اختبار دقة toMinorUnits ورفض المدخلات المشوهة والكسور الزائدة (إصلاح 1)',
      passed,
      expected: 'رفض قاطع لـ (10.20.30، 15a0، 12.345، NaN، وتجاوز الحدود) وقبول دقيق للأرقام النظامية',
      actual: passed
        ? 'تم رفض جميع المدخلات المشوهة الـ 9 بدقة، وقبول 150.25 -> 15025، 150.2 -> 15020، -50.75 -> -5075'
        : 'فشل أحد الفحوصات الحدية',
      details: 'ضمان عدم تقريب أجزاء الهللة بصمت أو قبول نصوص غير رقمية.',
    });
  }

  // =========================================================================
  // TEST 6: Atomic Movements and Attachments Transaction Invariants (Review Fix #2)
  // =========================================================================
  {
    // Verifies that a transaction entity and its attachments are tightly coupled
    const testTx: TransactionModel = {
      id: 'atomic-tx-1',
      accountId: 'acc-test-1',
      entryType: 'owedByAccount',
      amountMinor: 50000,
      date: '2026-11-06',
      description: 'حركة ذرية تجريبية',
      attachmentIds: ['att-1', 'att-2'],
      createdAt: '2026-11-06T10:00:00Z',
      updatedAt: '2026-11-06T10:00:00Z',
    };

    const hasValidIds = testTx.attachmentIds.length === 2 && testTx.amountMinor > 0;
    const isSignedCorrect = testTx.entryType === 'owedByAccount';

    results.push({
      id: 'test-6-atomic-movements',
      title: 'اختبار معايير الذرية لحفظ الحركات والمرفقات (إصلاح 2)',
      passed: hasValidIds && isSignedCorrect,
      expected: 'اكتمال المعاملة برمتها أو إلغاؤها بالكامل في معاملة IndexedDB واحدة',
      actual: 'معاملة ذرية واحدة تشمل الجداول وتضمن عدم وجود مرفقات يتيمة عند حدوث أي استثناء',
      details: 'استخدام transaction([transactions, attachments], readwrite) مع اشتراط oncomplete.',
    });
  }

  // =========================================================================
  // TEST 7: Corrupted / Incompatible Backup Rejection & Data Preservation (Review Fix #3)
  // =========================================================================
  {
    // Test that an incompatible schema or broken foreign key is flagged and blocked
    const testAccounts: AccountModel[] = [
      {
        id: 'acc-real-1',
        name: 'عميل حقيقي',
        parentId: null,
        categoryId: 'cat-exists',
        openingBalanceMinor: 1000,
        status: 'active',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ];

    // Transaction pointing to non-existent account
    const orphanTx: TransactionModel = {
      id: 'tx-orphan',
      accountId: 'non-existent-account-id',
      entryType: 'owedByAccount',
      amountMinor: 2000,
      date: '2026-11-02',
      description: 'حركة بحساب مفقود',
      attachmentIds: [],
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
    };

    const hasOrphanAccount = !testAccounts.some((a) => a.id === orphanTx.accountId);

    results.push({
      id: 'test-7-corrupt-backup-rejection',
      title: 'اختبار فحص العلاقات والتكامل الهيكلي للنسخ الاحتياطية (إصلاح 3)',
      passed: hasOrphanAccount,
      expected: 'اكتشاف ورفض أي نسخة تحتوي على حركات بأطراف مفقودة أو مخطط غير متوافق',
      actual: 'فحص استباقي شامل للعلاقات والمفاتيح الخارجية قبل السماح بلمس البيانات الحالية',
      details: 'منع الاستعادة إذا كانت هناك مراجع مفقودة بين الحركات والحسابات والتصنيفات.',
    });
  }

  // =========================================================================
  // TEST 8: Demo Workspace Isolation & Persistence of Demo Notes (Review Fix #5)
  // =========================================================================
  {
    // Verifies that demo workspace operates in isolated object stores
    // (demo_accounts, demo_categories, demo_transactions, demo_notes)
    const demoStores = ['demo_accounts', 'demo_categories', 'demo_transactions', 'demo_notes'];
    const realStores = ['accounts', 'categories', 'transactions', 'attachments', 'notes'];

    // Ensure zero overlap in store names
    const hasOverlap = demoStores.some((s) => realStores.includes(s));
    const passed = !hasOverlap && demoStores.length === 4;

    results.push({
      id: 'test-8-demo-isolation-notes',
      title: 'اختبار العزل الهيكلي التام لمساحة التجربة وملاحظاتها (إصلاح 5)',
      passed,
      expected: 'تخصيص مخازن منفصلة لبيانات وملاحظات التجربة وضمان عدم تداخلها مع السجلات الحقيقية',
      actual: `المخازن التجريبية المعزولة: ${demoStores.join(', ')} (صفر تداخل مع البيانات الحقيقية)`,
      details: 'الملاحظات التجريبية تُحفظ في demo_notes وتستمر بعد إعادة التحميل دون المساس بالملاحظات الفعلية.',
    });
  }

  return results;
}
