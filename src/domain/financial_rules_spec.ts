/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Verification Test Suite
 * Executable specifications testing all invariants from Document v2
 */

import {
  calculateAccountBalance,
  calculateAccountStatement,
  calculateDashboardSummary,
  checkTreeCycle,
} from './balance_calculator.ts';
import { AccountModel, CategoryModel, TransactionModel } from './types.ts';

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

    // Attempt 1: Setting parent of acc-1 to acc-1 (self cycle) -> Must be rejected (true)
    const selfCycle = checkTreeCycle(accounts, 'acc-1', 'acc-1');
    // Attempt 2: Setting parent of acc-1 to acc-3 (descendant cycle) -> Must be rejected (true)
    const descendantCycle = checkTreeCycle(accounts, 'acc-1', 'acc-3');
    // Attempt 3: Setting parent of acc-3 to null -> Safe (false)
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
  // TEST 5: Stable Chronological Sorting with Id & CreatedAt tiebreakers
  // =========================================================================
  {
    const acc: AccountModel = {
      id: 'acc-sort',
      name: 'حساب فرز',
      parentId: null,
      categoryId: 'c1',
      openingBalanceMinor: 0,
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    const txs: TransactionModel[] = [
      {
        id: 'tx-b',
        accountId: 'acc-sort',
        entryType: 'owedByAccount',
        amountMinor: 2000,
        date: '2026-11-02',
        description: 'حركة ثانية بنفس اليوم',
        attachmentIds: [],
        createdAt: '2026-11-02T12:00:00Z',
        updatedAt: '2026-11-02T12:00:00Z',
      },
      {
        id: 'tx-a',
        accountId: 'acc-sort',
        entryType: 'owedByAccount',
        amountMinor: 1000,
        date: '2026-11-02',
        description: 'حركة أولى بنفس اليوم',
        attachmentIds: [],
        createdAt: '2026-11-02T08:00:00Z',
        updatedAt: '2026-11-02T08:00:00Z',
      },
    ];

    const statement = calculateAccountStatement(acc, txs);
    const passed = statement.rows[0].transaction.id === 'tx-a' &&
                   statement.rows[1].transaction.id === 'tx-b' &&
                   statement.rows[0].runningBalanceMinor === 1000 &&
                   statement.rows[1].runningBalanceMinor === 3000;

    results.push({
      id: 'test-5-stable-sorting',
      title: 'اختبار الفرز الزمني الثابت لحركات نفس اليوم (date -> createdAt -> id)',
      passed,
      expected: 'الترتيب: tx-a (8:00) ثم tx-b (12:00) مع تراكم رصيد 10.00 ثم 30.00',
      actual: `الترتيب الفعلي: ${statement.rows.map((r) => r.transaction.id).join(' -> ')}، الأرصدة: ${statement.rows.map((r) => (r.runningBalanceMinor / 100).toFixed(2)).join(' -> ')}`,
      details: 'يضمن تطابق كشف الحساب دائماً بغض النظر عن ترتيب استرجاع قاعدة البيانات.',
    });
  }

  // =========================================================================
  // TEST 6: Strict Integer Minor Units & No Float Drift
  // 0.10 + 0.20 = 0.30 exactly in halalas
  // =========================================================================
  {
    const acc: AccountModel = {
      id: 'acc-halalas',
      name: 'حساب الهللات',
      parentId: null,
      categoryId: 'c1',
      openingBalanceMinor: 0,
      status: 'active',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    };

    // In double, 0.1 + 0.2 = 0.30000000000000004
    // In minor units (10 halalas + 20 halalas = 30 halalas)
    const txs: TransactionModel[] = [
      {
        id: 't-1',
        accountId: 'acc-halalas',
        entryType: 'owedByAccount',
        amountMinor: 10, // 0.10 SAR
        date: '2026-11-01',
        description: '10 هللات',
        attachmentIds: [],
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
      {
        id: 't-2',
        accountId: 'acc-halalas',
        entryType: 'owedByAccount',
        amountMinor: 20, // 0.20 SAR
        date: '2026-11-01',
        description: '20 هللة',
        attachmentIds: [],
        createdAt: '2026-11-01T10:01:00Z',
        updatedAt: '2026-11-01T10:01:00Z',
      },
    ];

    const balance = calculateAccountBalance(acc, txs);
    const passed = balance === 30;

    results.push({
      id: 'test-6-minor-units-precision',
      title: 'اختبار دقة وحدات الهللة ومنع أخطاء الفاصلة العائمة (0.10 + 0.20 = 0.30)',
      passed,
      expected: 'الرصيد: 30 هللة (0.30 ر.س) كعدد صحيح دقيق تماماً',
      actual: `الرصيد: ${balance} هللة (${(balance / 100).toFixed(2)} ر.س)`,
      details: 'منع انحرافات الحسابات العشرية وتطابق الحسابات الرياضية البنكية.',
    });
  }

  return results;
}
