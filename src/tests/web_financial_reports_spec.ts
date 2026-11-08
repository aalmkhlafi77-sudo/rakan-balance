/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Web Financial Reports Automated Verification Suite (WEB-F3)
 * Verifies calculation accuracy, category non-double-counting aggregations, period statement calculations,
 * historical cutoff precision, HTML injection protection, and debtors/creditors analysis.
 */

import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import {
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
  generateDebtorsCreditorsReport,
  generatePeriodSummaryReport,
} from '../domain/financial_reports.ts';
import { escapeHtml } from '../services/pdf_export.ts';

export interface WebReportsTestResult {
  passedCount: number;
  failedCount: number;
  results: { id: string; name: string; passed: boolean; message: string }[];
}

export async function runWebReportsTestSuite(): Promise<WebReportsTestResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function recordResult(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  // --- Mock Test Fixtures ---
  const mockCategories: CategoryModel[] = [
    { id: 'cat_1', name: 'عملاء وتجار', sortOrder: 1 },
    { id: 'cat_2', name: 'موردون وسلفيات', sortOrder: 2 },
  ];

  const mockAccounts: AccountModel[] = [
    {
      id: 'acc_parent_1',
      name: 'مجموعة الأب',
      parentId: null,
      categoryId: 'cat_1',
      openingBalanceMinor: 10000, // 100 SAR
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'acc_child_1',
      name: 'فرعي الابن',
      parentId: 'acc_parent_1',
      categoryId: 'cat_1',
      openingBalanceMinor: 5000, // 50 SAR
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'acc_creditor_1',
      name: 'مورد سلف',
      parentId: null,
      categoryId: 'cat_2',
      openingBalanceMinor: -20000, // -200 SAR (عليك)
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockTransactions: TransactionModel[] = [
    // Move on acc_parent_1: owedBy 50 SAR (5000 halalas) on 2026-02-01 -> net balance = 10000 + 5000 = 15000 (150 SAR)
    {
      id: 'tx_1',
      accountId: 'acc_parent_1',
      entryType: 'owedByAccount',
      amountMinor: 5000,
      date: '2026-02-01',
      description: 'حركة الأب',
      attachmentIds: [],
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-02-01T10:00:00Z',
    },
    // Move on acc_child_1: owedBy 30 SAR (3000 halalas) on 2026-02-15 -> net balance = 5000 + 3000 = 8000 (80 SAR)
    {
      id: 'tx_2',
      accountId: 'acc_child_1',
      entryType: 'owedByAccount',
      amountMinor: 3000,
      date: '2026-02-15',
      description: 'حركة الفرعي',
      attachmentIds: [],
      createdAt: '2026-02-15T10:00:00Z',
      updatedAt: '2026-02-15T10:00:00Z',
    },
    // Move on acc_creditor_1: owedTo 100 SAR (10000 halalas) on 2026-02-20 -> net balance = -20000 - 10000 = -30000 (-300 SAR)
    {
      id: 'tx_3',
      accountId: 'acc_creditor_1',
      entryType: 'owedToAccount',
      amountMinor: 10000,
      date: '2026-02-20',
      description: 'سلفية إضافة',
      attachmentIds: [],
      createdAt: '2026-02-20T10:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z',
    },
    // Future transaction after 2026-02-28: owedBy 500 SAR (50000 halalas) on 2026-03-10
    {
      id: 'tx_future',
      accountId: 'acc_parent_1',
      entryType: 'owedByAccount',
      amountMinor: 50000,
      date: '2026-03-10',
      description: 'حركة مستقبلية بعد تاريخ التقرير',
      attachmentIds: [],
      createdAt: '2026-03-10T10:00:00Z',
      updatedAt: '2026-03-10T10:00:00Z',
    },
  ];

  // Test 1: Accounts Balance Report direct balance totals
  try {
    const report = generateAccountsBalanceReport(mockAccounts, mockTransactions, mockCategories);
    const parentRow = report.rows.find((r) => r.account.id === 'acc_parent_1');
    const childRow = report.rows.find((r) => r.account.id === 'acc_child_1');

    // Total parent balance including future = 10000 + 5000 + 50000 = 65000
    const parentOk = parentRow?.currentBalanceMinor === 65000;
    const childOk = childRow?.currentBalanceMinor === 8000;

    recordResult(
      'F3_TEST_01',
      'حساب الأرصدة المباشرة في تقرير أرصدة الحسابات',
      parentOk && childOk,
      `parent: ${parentRow?.currentBalanceMinor} (exp 65000), child: ${childRow?.currentBalanceMinor} (exp 8000)`
    );
  } catch (err: any) {
    recordResult('F3_TEST_01', 'حساب الأرصدة المباشرة في تقرير أرصدة الحسابات', false, err.message);
  }

  // Test 2: Category aggregation report without double counting
  try {
    const catReport = generateCategorySummaryReport(mockAccounts, mockTransactions, mockCategories, '2026-02-28');
    const cat1Row = catReport.rows.find((r) => r.category.id === 'cat_1');
    const cat2Row = catReport.rows.find((r) => r.category.id === 'cat_2');

    // cat_1 up to Feb 28 has acc_parent_1 (15000) and acc_child_1 (8000) -> totalReceivable = 23000 halalas
    const cat1Ok = cat1Row?.totalReceivableMinor === 23000 && cat1Row?.accountsCount === 2;
    const cat2Ok = cat2Row?.totalPayableMinor === 30000 && cat2Row?.accountsCount === 1;
    const grandNetOk = catReport.grandNetBalanceMinor === 23000 - 30000; // -7000

    recordResult(
      'F3_TEST_02',
      'تجميع الحسابات في التصنيفات دون تكرار الحسابات الفرعية والرئيسية',
      cat1Ok && cat2Ok && grandNetOk,
      `cat1 rec: ${cat1Row?.totalReceivableMinor} (exp 23000), cat2 pay: ${cat2Row?.totalPayableMinor} (exp 30000), grandNet: ${catReport.grandNetBalanceMinor} (exp -7000)`
    );
  } catch (err: any) {
    recordResult('F3_TEST_02', 'تجميع الحسابات في التصنيفات دون تكرار الحسابات الفرعية والرئيسية', false, err.message);
  }

  // Test 3: Period summary report date range opening balance calculation
  try {
    const periodReport = generatePeriodSummaryReport(
      mockAccounts,
      mockTransactions,
      mockCategories,
      '2026-02-10',
      '2026-02-28'
    );

    const openingOk = periodReport.openingBalanceMinor === 0;
    const countOk = periodReport.transactionsCount === 2;
    const periodNetOk = periodReport.periodNetChangeMinor === -7000;
    const closingOk = periodReport.closingBalanceMinor === -7000;

    recordResult(
      'F3_TEST_03',
      'حساب الرصيد الافتتاحي والحركة والختامي للفترة الزمانية',
      openingOk && countOk && periodNetOk && closingOk,
      `opening: ${periodReport.openingBalanceMinor} (exp 0), count: ${periodReport.transactionsCount} (exp 2), net: ${periodReport.periodNetChangeMinor} (exp -7000), closing: ${periodReport.closingBalanceMinor} (exp -7000)`
    );
  } catch (err: any) {
    recordResult('F3_TEST_03', 'حساب الرصيد الافتتاحي والحركة والختامي للفترة الزمانية', false, err.message);
  }

  // Test 4: Debtors & Creditors Separation
  try {
    const dcReport = generateDebtorsCreditorsReport(mockAccounts, mockTransactions, mockCategories, '2026-02-28');

    const debtorsCountOk = dcReport.debtors.length === 2; // acc_parent_1 (15000) and acc_child_1 (8000)
    const creditorsCountOk = dcReport.creditors.length === 1; // acc_creditor_1 (30000)
    const topDebtorOk = dcReport.topDebtorName === 'مجموعة الأب' && dcReport.topDebtorAmountMinor === 15000;
    const topCreditorOk = dcReport.topCreditorName === 'مورد سلف' && dcReport.topCreditorAmountMinor === 30000;

    recordResult(
      'F3_TEST_04',
      'فصل تحليل المدينين (لك) والدائنين (عليك) ونسب التركز',
      debtorsCountOk && creditorsCountOk && topDebtorOk && topCreditorOk,
      `debtors: ${dcReport.debtors.length}, creditors: ${dcReport.creditors.length}, topDebtor: ${dcReport.topDebtorName}`
    );
  } catch (err: any) {
    recordResult('F3_TEST_04', 'فصل تحليل المدينين (لك) والدائنين (عليك) ونسب التركز', false, err.message);
  }

  // Test 5: HTML Injection Protection Verification
  try {
    const dangerousInput = '<script>alert("XSS")</script> & "Quoted"';
    const escaped = escapeHtml(dangerousInput);
    const isSafe = !escaped.includes('<script>') && escaped.includes('&lt;script&gt;') && escaped.includes('&quot;');

    recordResult(
      'F3_TEST_05',
      'حماية مخرجات التقارير والطباعة من حقن HTML و JavaScript',
      isSafe,
      `Input: ${dangerousInput} -> Escaped: ${escaped}`
    );
  } catch (err: any) {
    recordResult('F3_TEST_05', 'حماية مخرجات التقارير والطباعة من حقن HTML و JavaScript', false, err.message);
  }

  // Test 6: Historical Cutoff Exclusion Verification (toDate = 2026-02-28 strictly excludes tx_future)
  try {
    const cutoffReport = generateAccountsBalanceReport(mockAccounts, mockTransactions, mockCategories, {
      toDate: '2026-02-28',
    });
    const parentRow = cutoffReport.rows.find((r) => r.account.id === 'acc_parent_1');

    // On 2026-02-28, acc_parent_1 balance must be 15000 (150 SAR), strictly excluding tx_future (50000 halalas)
    const cutoffSuccess = parentRow?.currentBalanceMinor === 15000 && cutoffReport.totalReceivableMinor === 23000;

    recordResult(
      'F3_TEST_06',
      'دقة الأرصدة التاريخية واستبعاد الحركات اللاحقة لتاريخ نهاية التقرير',
      cutoffSuccess,
      `parent cutoff balance: ${parentRow?.currentBalanceMinor} (exp 15000), totalRec: ${cutoffReport.totalReceivableMinor} (exp 23000)`
    );
  } catch (err: any) {
    recordResult('F3_TEST_06', 'دقة الأرصدة التاريخية واستبعاد الحركات اللاحقة لتاريخ نهاية التقرير', false, err.message);
  }

  return { passedCount, failedCount, results };
}
