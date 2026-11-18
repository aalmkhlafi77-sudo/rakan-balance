/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Unified ReportScope, Zero-Dormant Exclusion & Single-Source-of-Truth Verification Suite
 * Covers FILTER-01 through FILTER-15.
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import {
  DATE_RANGE_ERROR_MESSAGE,
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
  generateDebtorsCreditorsReport,
  generatePeriodSummaryReport,
  isReportRelevantAccount,
} from '../domain/financial_reports.ts';
import { generateHierarchicalAccountsReport } from '../domain/hierarchical_accounts.ts';
import {
  createAccountsBalanceWorkbook,
  createCategoriesSummaryWorkbook,
  createComprehensiveAccountsWorkbook,
  createDebtorsCreditorsWorkbook,
  createPeriodReportWorkbook,
} from '../services/excel_export.ts';
import {
  buildAccountsReportPdfConfig,
  buildCategoriesReportPdfConfig,
  buildDebtorsCreditorsReportPdfConfig,
  buildHierarchicalReportPdfConfig,
  buildPeriodReportPdfConfig,
  getPdfReportHtml,
} from '../services/pdf_export.ts';

export interface ReportFiltersTestSuiteResult {
  passedCount: number;
  failedCount: number;
  results: { id: string; name: string; passed: boolean; message: string }[];
}

function makeAccount(
  id: string,
  name: string,
  parentId: string | null = null,
  openingBalanceMinor: number = 0,
  categoryId: string = 'cat_1',
  status: 'active' | 'archived' = 'active',
  phone?: string
): AccountModel {
  return {
    id,
    name,
    parentId,
    categoryId,
    openingBalanceMinor,
    status,
    phone,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeTx(
  id: string,
  accountId: string,
  entryType: 'owedByAccount' | 'owedToAccount',
  amountMinor: number,
  date: string,
  description: string = 'قيد اختبار'
): TransactionModel {
  return {
    id,
    accountId,
    entryType,
    amountMinor,
    date,
    description,
    attachmentIds: [],
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
  };
}

export async function runReportFiltersTestSuite(): Promise<ReportFiltersTestSuiteResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function record(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  const categories: CategoryModel[] = [
    { id: 'cat_1', name: 'عملاء', sortOrder: 1 },
    { id: 'cat_2', name: 'موردون', sortOrder: 2 },
  ];

  // =========================================================================
  // FILTER-01: Zero Dormant (0 / 0 tx / 0 -> hidden across all reports)
  // =========================================================================
  {
    const accs = [
      makeAccount('A_DORMANT', 'حساب خامل صفري', null, 0, 'cat_1'),
      makeAccount('A_REAL', 'حساب فعلي', null, 10000, 'cat_1'),
    ];
    const rAcc = generateAccountsBalanceReport(accs, [], categories);
    const rHier = generateHierarchicalAccountsReport(accs, [], categories);
    const rCat = generateCategorySummaryReport(accs, [], categories);
    const rPer = generatePeriodSummaryReport(accs, [], categories);
    const rDc = generateDebtorsCreditorsReport(accs, [], categories);

    const helperDormant = isReportRelevantAccount({
      openingAtPeriodMinor: 0,
      closingBalanceMinor: 0,
      periodTransactionCount: 0,
    });

    const passed =
      helperDormant === false &&
      rAcc.rows.length === 1 &&
      rAcc.rows[0].account.id === 'A_REAL' &&
      rAcc.excludedDormantCount === 1 &&
      rHier.rows.length === 1 &&
      rHier.rows[0].account.id === 'A_REAL' &&
      rHier.excludedDormantCount === 1 &&
      rCat.rows[0].accountsCount === 1 &&
      rCat.excludedDormantCount === 1 &&
      rPer.includedAccountsCount === 1 &&
      rPer.excludedDormantCount === 1 &&
      rDc.debtors.length === 1;

    record(
      'FILTER-01',
      'Zero Dormant (0 / 0 tx / 0) يُستبعد تلقائياً من جميع التقارير',
      passed,
      `accRows=${rAcc.rows.length}, hierRows=${rHier.rows.length}, excluded=${rAcc.excludedDormantCount}, catCount=${rCat.rows[0]?.accountsCount}`
    );
  }

  // =========================================================================
  // FILTER-02: Zero Closing With Activity (0, +1000, -1000, closing=0 -> shown)
  // =========================================================================
  {
    const accs = [makeAccount('A_MOVED_ZERO', 'حساب تحرك وأغلق صفراً', null, 0, 'cat_1')];
    const txs = [
      makeTx('t1', 'A_MOVED_ZERO', 'owedByAccount', 1000, '2026-02-05', 'شراء'),
      makeTx('t2', 'A_MOVED_ZERO', 'owedToAccount', 1000, '2026-02-06', 'سداد'),
    ];
    const rAcc = generateAccountsBalanceReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    const rHier = generateHierarchicalAccountsReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });

    const passed =
      rAcc.rows.length === 1 &&
      rAcc.rows[0].currentBalanceMinor === 0 &&
      rAcc.rows[0].periodTransactionCount === 2 &&
      rAcc.excludedDormantCount === 0 &&
      rHier.rows.length === 1 &&
      rHier.rows[0].directBalanceMinor === 0 &&
      rHier.rows[0].periodTransactionCount === 2;

    record(
      'FILTER-02',
      'Zero Closing With Activity: الرصيد 0 لكن له حركتان فيظهر في التقارير',
      passed,
      `accRows=${rAcc.rows.length}, txCount=${rAcc.rows[0]?.periodTransactionCount}, closing=${rAcc.rows[0]?.currentBalanceMinor}`
    );
  }

  // =========================================================================
  // FILTER-03: Non-Zero No Activity (opening=5000, tx=0, closing=5000 -> shown)
  // =========================================================================
  {
    const accs = [makeAccount('A_STATIC', 'حساب برصيد ثابت', null, 5000, 'cat_1')];
    const rAcc = generateAccountsBalanceReport(accs, [], categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    const rHier = generateHierarchicalAccountsReport(accs, [], categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    const rCat = generateCategorySummaryReport(accs, [], categories);
    const rDc = generateDebtorsCreditorsReport(accs, [], categories);

    const passed =
      rAcc.rows.length === 1 &&
      rAcc.rows[0].currentBalanceMinor === 5000 &&
      rHier.rows.length === 1 &&
      rHier.financialAnalysis.zeroMovementAccounts.length === 1 &&
      rCat.rows[0].totalReceivableMinor === 5000 &&
      rDc.debtors.length === 1 &&
      rDc.debtors[0].balanceMinor === 5000;

    record(
      'FILTER-03',
      'Non-Zero No Activity: يظهر في الأرصدة والشجرة والتحليل والتصنيفات والمدينين',
      passed,
      `acc=${rAcc.rows.length}, zeroMovAnalysis=${rHier.financialAnalysis.zeroMovementAccounts.length}, debtors=${rDc.debtors.length}`
    );
  }

  // =========================================================================
  // FILTER-04: Parent Zero / Child Active (A=0 -> B=5000 -> both shown, A.consolidated=5000)
  // =========================================================================
  {
    const accs = [
      makeAccount('A_PARENT_ZERO', 'الأب تجميعي صفري', null, 0, 'cat_1'),
      makeAccount('B_CHILD_ACTIVE', 'فرع نشط برصيد', 'A_PARENT_ZERO', 5000, 'cat_1'),
    ];
    const rHier = generateHierarchicalAccountsReport(accs, [], categories);
    const parentRow = rHier.rows.find((r) => r.account.id === 'A_PARENT_ZERO');
    const childRow = rHier.rows.find((r) => r.account.id === 'B_CHILD_ACTIVE');

    const passed =
      rHier.rows.length === 2 &&
      Boolean(parentRow) &&
      Boolean(childRow) &&
      parentRow?.directBalanceMinor === 0 &&
      parentRow?.consolidatedBalanceMinor === 5000 &&
      rHier.excludedDormantCount === 0;

    record(
      'FILTER-04',
      'Parent Zero / Child Active: بقاء الأب الصفري ظاهراً بسبب تبعية نشطة وحساب المجمع 5000',
      passed,
      `rows=${rHier.rows.length}, parentCons=${parentRow?.consolidatedBalanceMinor}`
    );
  }

  // =========================================================================
  // FILTER-05: Entire Empty Tree (A=0 -> B=0, C=0, no txs -> entire tree hidden)
  // =========================================================================
  {
    const accs = [
      makeAccount('TREE_ROOT', 'جذر خامل', null, 0, 'cat_1'),
      makeAccount('TREE_C1', 'فرع خامل 1', 'TREE_ROOT', 0, 'cat_1'),
      makeAccount('TREE_C2', 'فرع خامل 2', 'TREE_ROOT', 0, 'cat_1'),
    ];
    const rHier = generateHierarchicalAccountsReport(accs, [], categories);
    const rAcc = generateAccountsBalanceReport(accs, [], categories);

    const passed =
      rHier.rows.length === 0 &&
      rHier.rootSummaries.length === 0 &&
      rHier.excludedDormantCount === 3 &&
      rAcc.rows.length === 0 &&
      rAcc.excludedDormantCount === 3;

    record(
      'FILTER-05',
      'Entire Empty Tree: استبعاد الشجرة الصفرية الخاملة بالكامل (جذر + فروع)',
      passed,
      `hierRows=${rHier.rows.length}, excluded=${rHier.excludedDormantCount}`
    );
  }

  // =========================================================================
  // FILTER-06: Settled Account (Opening=5000, movement=-5000, closing=0 -> shown & settledAccounts)
  // =========================================================================
  {
    const accs = [makeAccount('A_SETTLED', 'عميل تمت تسويته', null, 5000, 'cat_1')];
    const txs = [makeTx('t_settle', 'A_SETTLED', 'owedToAccount', 5000, '2026-02-12', 'تسوية كاملة')];

    const rAcc = generateAccountsBalanceReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    const rHier = generateHierarchicalAccountsReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
    });
    const rDc = generateDebtorsCreditorsReport(accs, txs, categories, { toDate: '2026-02-28' });

    const passed =
      rAcc.rows.length === 1 &&
      rAcc.rows[0].currentBalanceMinor === 0 &&
      rHier.rows.length === 1 &&
      rHier.financialAnalysis.settledAccounts.length === 1 &&
      rHier.financialAnalysis.settledAccounts[0].account.id === 'A_SETTLED' &&
      rHier.financialAnalysis.zeroMovementAccounts.length === 0 &&
      rDc.debtors.length === 0 &&
      rDc.creditors.length === 0;

    record(
      'FILTER-06',
      'Settled Account: يظهر بالحسابات وبقائمة الحسابات المسواة ويُستبعد من المدينين/الدائنين',
      passed,
      `settled=${rHier.financialAnalysis.settledAccounts.length}, zeroMov=${rHier.financialAnalysis.zeroMovementAccounts.length}, dcDebtors=${rDc.debtors.length}`
    );
  }

  // =========================================================================
  // FILTER-07: Search (preserves ancestors, marks match, financial totals unchanged)
  // =========================================================================
  {
    const accs = [
      makeAccount('R1', 'مجموعة الأمل', null, 10000, 'cat_1'),
      makeAccount('C1', 'فرع محمد التجاري', 'R1', 20000, 'cat_1'),
      makeAccount('R2', 'مجموعة مستقلة', null, 50000, 'cat_1'),
    ];
    const txs = [
      makeTx('ts1', 'C1', 'owedByAccount', 5000, '2026-02-10', 'فاتورة'),
      makeTx('ts2', 'R2', 'owedByAccount', 10000, '2026-02-11', 'فاتورة أخرى'),
    ];

    const baseHier = generateHierarchicalAccountsReport(accs, txs, categories, {});
    const searchHier = generateHierarchicalAccountsReport(accs, txs, categories, { searchQuery: 'محمد' });

    const baseAcc = generateAccountsBalanceReport(accs, txs, categories, {});
    const searchAcc = generateAccountsBalanceReport(accs, txs, categories, { searchQuery: 'محمد' });

    const basePer = generatePeriodSummaryReport(accs, txs, categories, {});
    const searchPer = generatePeriodSummaryReport(accs, txs, categories, { searchQuery: 'محمد' });

    const r1SearchRow = searchHier.rows.find((r) => r.account.id === 'R1');
    const c1SearchRow = searchHier.rows.find((r) => r.account.id === 'C1');
    const r2MissingInSearch = !searchHier.rows.some((r) => r.account.id === 'R2');

    const passed =
      // Hierarchical search preserves R1 ancestor + C1 match, excludes R2
      searchHier.rows.length === 2 &&
      Boolean(r1SearchRow?.isSearchContextOnly) &&
      !r1SearchRow?.isSearchMatch &&
      Boolean(c1SearchRow?.isSearchMatch) &&
      r2MissingInSearch &&
      searchHier.searchMatchCount === 1 &&
      // Financial totals remain 100% unchanged by search
      searchHier.totalDirectReceivableMinor === baseHier.totalDirectReceivableMinor &&
      searchHier.executiveSummary.totalClosingDirectBalanceMinor ===
        baseHier.executiveSummary.totalClosingDirectBalanceMinor &&
      searchAcc.rows.length === 1 &&
      searchAcc.totalReceivableMinor === baseAcc.totalReceivableMinor &&
      searchAcc.netBalanceMinor === baseAcc.netBalanceMinor &&
      searchPer.rows.length === 1 &&
      searchPer.totalOwedByMinor === basePer.totalOwedByMinor &&
      searchPer.closingBalanceMinor === basePer.closingBalanceMinor;

    record(
      'FILTER-07',
      'Hierarchical & Display-Only Search: حفظ الآباء وتمييز المطابقة وثبات جميع الإجماليات المالية',
      passed,
      `hierRows=${searchHier.rows.length}, R1Context=${r1SearchRow?.isSearchContextOnly}, C1Match=${c1SearchRow?.isSearchMatch}, totSame=${searchHier.totalDirectReceivableMinor === baseHier.totalDirectReceivableMinor}`
    );
  }

  // =========================================================================
  // FILTER-08: Category (excluded category child does NOT contribute to consolidatedBalanceMinor)
  // =========================================================================
  {
    const accs = [
      makeAccount('P_CAT1', 'أب تصنيف 1', null, 10000, 'cat_1'),
      makeAccount('C_CAT1', 'ابن تصنيف 1', 'P_CAT1', 20000, 'cat_1'),
      makeAccount('C_CAT2', 'ابن تصنيف 2 مستبعد', 'P_CAT1', 90000, 'cat_2'),
      makeAccount('P_CAT2', 'أب تصنيف 2', null, 5000, 'cat_2'),
      makeAccount('C2_IN_CAT1', 'ابن تصنيف 1 لأب مستبعد', 'P_CAT2', 15000, 'cat_1'),
    ];
    const rCat1 = generateHierarchicalAccountsReport(accs, [], categories, { categoryId: 'cat_1' });
    const pCat1Row = rCat1.rows.find((r) => r.account.id === 'P_CAT1');
    const c2Row = rCat1.rows.find((r) => r.account.id === 'C2_IN_CAT1');

    const passed =
      pCat1Row?.consolidatedBalanceMinor === 30000 && // 10000 + 20000 (C_CAT2=90000 excluded!)
      pCat1Row?.descendantCount === 1 &&
      pCat1Row?.isTrueRoot === true &&
      Boolean(c2Row) &&
      c2Row?.hasExcludedParent === true &&
      c2Row?.isTrueRoot === false && // Must NOT masquerade as true root
      c2Row?.hierarchicalPath.includes('أب تصنيف 2') && // Preserves full hierarchical path
      !rCat1.rootSummaries.some((rs) => rs.account.id === 'C2_IN_CAT1');

    record(
      'FILTER-08',
      'Category Filter: عزل فروع التصنيف المستبعد من الرصيد المجمع ومنع تحول الفروع اليتيمة لجذور',
      passed,
      `pCat1Cons=${pCat1Row?.consolidatedBalanceMinor} (exp 30000), c2IsRoot=${c2Row?.isTrueRoot}, hasExcludedParent=${c2Row?.hasExcludedParent}`
    );
  }

  // =========================================================================
  // FILTER-09: Status (archived child excluded from active consolidated math & included in all)
  // =========================================================================
  {
    const accs = [
      makeAccount('P_ACTIVE', 'أب نشط', null, 10000, 'cat_1', 'active'),
      makeAccount('C_ARCHIVED', 'فرع مؤرشف', 'P_ACTIVE', 40000, 'cat_1', 'archived'),
    ];
    const rActive = generateHierarchicalAccountsReport(accs, [], categories, { status: 'active' });
    const rArchived = generateHierarchicalAccountsReport(accs, [], categories, { status: 'archived' });
    const rAll = generateHierarchicalAccountsReport(accs, [], categories, { status: 'all' });

    const pActive = rActive.rows.find((r) => r.account.id === 'P_ACTIVE');
    const pAll = rAll.rows.find((r) => r.account.id === 'P_ACTIVE');
    const cArchived = rArchived.rows.find((r) => r.account.id === 'C_ARCHIVED');

    const passed =
      rActive.rows.length === 1 &&
      pActive?.consolidatedBalanceMinor === 10000 &&
      pActive?.descendantCount === 0 &&
      rAll.rows.length === 2 &&
      pAll?.consolidatedBalanceMinor === 50000 &&
      rArchived.rows.length === 1 &&
      cArchived?.hasExcludedParent === true &&
      cArchived?.isTrueRoot === false;

    record(
      'FILTER-09',
      'Status Filter: عزل المؤرشف عن حسابات النشطين وإدماجه عند اختيار الكل',
      passed,
      `activeCons=${pActive?.consolidatedBalanceMinor}, allCons=${pAll?.consolidatedBalanceMinor}, archivedIsolated=${rArchived.rows.length}`
    );
  }

  // =========================================================================
  // FILTER-10: Date Guard (fromDate > toDate returns validationError without computing)
  // =========================================================================
  {
    const accs = [makeAccount('A1', 'حساب', null, 10000, 'cat_1')];
    const badScope = { fromDate: '2026-03-10', toDate: '2026-02-01' };

    const rAcc = generateAccountsBalanceReport(accs, [], categories, badScope);
    const rHier = generateHierarchicalAccountsReport(accs, [], categories, badScope);
    const rCat = generateCategorySummaryReport(accs, [], categories, badScope);
    const rPer = generatePeriodSummaryReport(accs, [], categories, badScope);

    const passed =
      rAcc.validationError === DATE_RANGE_ERROR_MESSAGE &&
      rAcc.rows.length === 0 &&
      rAcc.totalReceivableMinor === 0 &&
      rHier.validationError === DATE_RANGE_ERROR_MESSAGE &&
      rHier.rows.length === 0 &&
      rCat.validationError === DATE_RANGE_ERROR_MESSAGE &&
      rCat.rows.length === 0 &&
      rPer.validationError === DATE_RANGE_ERROR_MESSAGE &&
      rPer.rows.length === 0;

    record(
      'FILTER-10',
      'Date Range Guard: إيقاف الحساب وإظهار رسالة خطأ عند كون البداية بعد النهاية',
      passed,
      `accErr="${rAcc.validationError}", hierErr="${rHier.validationError}"`
    );
  }

  // =========================================================================
  // FILTER-11: UI/Screen Report Model vs Excel 1:1 Parity
  // =========================================================================
  {
    const accs = [
      makeAccount('E_ROOT', 'شركة الرياض', null, 100000, 'cat_1'),
      makeAccount('E_CHILD', 'فرع جدة', 'E_ROOT', 50000, 'cat_1'),
      makeAccount('E_CRED', 'مورد محلي', null, -40000, 'cat_2'),
    ];
    const txs = [
      makeTx('et1', 'E_ROOT', 'owedByAccount', 25000, '2026-02-10', 'دفعة مبيعات'),
      makeTx('et2', 'E_CHILD', 'owedToAccount', 10000, '2026-02-15', 'تحصيل'),
    ];
    const scope = { fromDate: '2026-02-01', toDate: '2026-02-28', status: 'active' as const };

    const rAcc = generateAccountsBalanceReport(accs, txs, categories, scope);
    const rHier = generateHierarchicalAccountsReport(accs, txs, categories, scope);
    const rCat = generateCategorySummaryReport(accs, txs, categories, scope);
    const rPer = generatePeriodSummaryReport(accs, txs, categories, scope);
    const rDc = generateDebtorsCreditorsReport(accs, txs, categories, scope);

    // Load back Accounts Excel
    const wbAcc = createAccountsBalanceWorkbook(rAcc, 'ر.س', { ownerName: 'اختبار' });
    const bufAcc = await wbAcc.xlsx.writeBuffer();
    const readAcc = new ExcelJS.Workbook();
    await readAcc.xlsx.load(bufAcc as ArrayBuffer);
    const accSheet = readAcc.getWorksheet('تقرير أرصدة الحسابات')!;
    const accLastRow = accSheet.getRow(accSheet.rowCount);
    const accExcelClosing = Number(accLastRow.getCell(7).value);

    // Load back Comprehensive Excel using exact report model
    const wbHier = createComprehensiveAccountsWorkbook({
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
      ownerName: 'اختبار',
      filterOptions: scope,
      report: rHier,
    });
    const bufHier = await wbHier.xlsx.writeBuffer();
    const readHier = new ExcelJS.Workbook();
    await readHier.xlsx.load(bufHier as ArrayBuffer);
    const hierDetailSheet = readHier.getWorksheet('الأرصدة التفصيلية')!;
    const hierTotalsRow = hierDetailSheet.getRow(hierDetailSheet.rowCount);
    const hierExcelClosing = Number(hierTotalsRow.getCell(9).value);

    // Load back Categories Excel
    const wbCat = createCategoriesSummaryWorkbook(rCat, 'ر.س');
    const bufCat = await wbCat.xlsx.writeBuffer();
    const readCat = new ExcelJS.Workbook();
    await readCat.xlsx.load(bufCat as ArrayBuffer);
    const catSheet = readCat.getWorksheet('تقرير التصنيفات')!;
    const catTotalsRow = catSheet.getRow(catSheet.rowCount);
    const catExcelNet = Number(catTotalsRow.getCell(5).value);

    // Load back Period Excel
    const wbPer = createPeriodReportWorkbook(rPer, 'ر.س');
    const bufPer = await wbPer.xlsx.writeBuffer();
    const readPer = new ExcelJS.Workbook();
    await readPer.xlsx.load(bufPer as ArrayBuffer);
    const perSheet = readPer.getWorksheet('كشف الحركة الشامل')!;
    const perTotalsRow = perSheet.getRow(perSheet.rowCount);
    const perExcelNet = Number(perTotalsRow.getCell(8).value);

    // Load back Debtors/Creditors Excel
    const wbDc = createDebtorsCreditorsWorkbook(rDc, 'ر.س');
    const bufDc = await wbDc.xlsx.writeBuffer();
    const readDc = new ExcelJS.Workbook();
    await readDc.xlsx.load(bufDc as ArrayBuffer);
    const debSheet = readDc.getWorksheet('المدينون (لك)')!;
    const debTotalsRow = debSheet.getRow(debSheet.rowCount);
    const dcExcelDebtors = Number(debTotalsRow.getCell(3).value);

    const passed =
      accSheet.name === 'تقرير أرصدة الحسابات' &&
      readAcc.worksheets.length === 1 && // Must NOT silently swap to 6-sheet comprehensive workbook!
      Math.round(accExcelClosing * 100) === rAcc.totalClosingBalanceMinor &&
      Math.round(hierExcelClosing * 100) === rHier.totalClosingDirectBalanceMinor &&
      Math.round(catExcelNet * 100) === rCat.grandNetBalanceMinor &&
      Math.round(perExcelNet * 100) === rPer.periodNetChangeMinor &&
      Math.round(dcExcelDebtors * 100) === rDc.totalDebtorsMinor;

    record(
      'FILTER-11',
      'Excel Single Source of Truth: تطابق تام 1:1 بين نموذج الشاشة وملفات Excel لجميع التبويبات',
      passed,
      `accSheets=${readAcc.worksheets.length}, accClose=${accExcelClosing * 100}/${rAcc.totalClosingBalanceMinor}, hierClose=${hierExcelClosing * 100}/${rHier.totalClosingDirectBalanceMinor}, catNet=${catExcelNet * 100}/${rCat.grandNetBalanceMinor}`
    );
  }

  // =========================================================================
  // FILTER-12: UI/Screen Report Model vs PDF 1:1 Parity & XSS Safety
  // =========================================================================
  {
    const accs = [
      makeAccount('P1', 'شركة <script>XSS</script> التجارة', null, 30000, 'cat_1'),
      makeAccount('P2', 'مؤسسة النور', null, -12000, 'cat_2'),
    ];
    const txs = [makeTx('pt1', 'P1', 'owedByAccount', 5000, '2026-02-10', 'حركة اختبار')];
    const scope = { fromDate: '2026-02-01', toDate: '2026-02-28', status: 'active' as const };

    const rAcc = generateAccountsBalanceReport(accs, txs, categories, scope);
    const rHier = generateHierarchicalAccountsReport(accs, txs, categories, scope);
    const rCat = generateCategorySummaryReport(accs, txs, categories, scope);
    const rPer = generatePeriodSummaryReport(accs, txs, categories, scope);
    const rDc = generateDebtorsCreditorsReport(accs, txs, categories, scope);

    const cfgAcc = buildAccountsReportPdfConfig(rAcc, { ownerName: 'راكان', currencySymbol: 'ر.س' });
    const cfgHier = buildHierarchicalReportPdfConfig(rHier, { ownerName: 'راكان', currencySymbol: 'ر.س' });
    const cfgCat = buildCategoriesReportPdfConfig(rCat, { ownerName: 'راكان', currencySymbol: 'ر.س' });
    const cfgPer = buildPeriodReportPdfConfig(rPer, { ownerName: 'راكان', currencySymbol: 'ر.س' });
    const cfgDc = buildDebtorsCreditorsReportPdfConfig(rDc, { ownerName: 'راكان', currencySymbol: 'ر.س' });

    const htmlAcc = getPdfReportHtml(cfgAcc);
    const htmlHier = getPdfReportHtml(cfgHier);

    const passed =
      cfgAcc.rows.length === rAcc.rows.length &&
      cfgHier.rows.length === rHier.rows.length &&
      cfgCat.rows.length === rCat.rows.length &&
      cfgPer.rows.length === rPer.rows.length &&
      cfgDc.rows.length === rDc.debtors.length + rDc.creditors.length &&
      !htmlAcc.includes('<script>XSS</script>') &&
      htmlAcc.includes('&lt;script&gt;XSS&lt;/script&gt;') &&
      htmlHier.includes('2026-02-01') &&
      htmlHier.includes('2026-02-28');

    record(
      'FILTER-12',
      'PDF Single Source of Truth: تطابق صفوف وإعدادات PDF مع نموذج الشاشة وحماية HTML',
      passed,
      `acc=${cfgAcc.rows.length}/${rAcc.rows.length}, hier=${cfgHier.rows.length}/${rHier.rows.length}, cat=${cfgCat.rows.length}, per=${cfgPer.rows.length}, dc=${cfgDc.rows.length}`
    );
  }

  // =========================================================================
  // FILTER-13: Categories Report Scope (status, fromDate/toDate, categoryId, zero-dormant)
  // =========================================================================
  {
    const accs = [
      makeAccount('K1', 'عميل نشط', null, 10000, 'cat_1', 'active'),
      makeAccount('K2', 'عميل خامل', null, 0, 'cat_1', 'active'),
      makeAccount('K3', 'عميل مؤرشف', null, 50000, 'cat_1', 'archived'),
      makeAccount('K4', 'مورد نشط', null, -20000, 'cat_2', 'active'),
    ];
    const txs = [
      makeTx('kt1', 'K1', 'owedByAccount', 5000, '2026-02-15', 'ضمن الفترة'),
      makeTx('kt2', 'K1', 'owedByAccount', 99000, '2026-03-05', 'خارج الفترة'),
    ];

    const rCat = generateCategorySummaryReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      status: 'active',
      categoryId: 'cat_1',
    });

    const cat1 = rCat.rows.find((r) => r.category.id === 'cat_1');
    const passed =
      rCat.rows.length === 1 &&
      cat1?.accountsCount === 1 && // Only K1 (K2 dormant excluded, K3 archived excluded)
      cat1?.totalReceivableMinor === 15000 && // 10000 + 5000, excludes 99000 after toDate
      rCat.includedAccountsCount === 1 &&
      rCat.excludedDormantCount === 1;

    record(
      'FILTER-13',
      'Categories Report Scope: تطبيق الحالة والتصنيف والتاريخ واستبعاد الصفر الخامل',
      passed,
      `rows=${rCat.rows.length}, cat1Accounts=${cat1?.accountsCount}, cat1Rec=${cat1?.totalReceivableMinor}`
    );
  }

  // =========================================================================
  // FILTER-14: Period Transactions Scope (categoryId, status, dates, display search)
  // =========================================================================
  {
    const accs = [
      makeAccount('PA1', 'عميل أ', null, 10000, 'cat_1', 'active'),
      makeAccount('PA2', 'مورد ب', null, 0, 'cat_2', 'active'),
      makeAccount('PA3', 'عميل مؤرشف', null, 5000, 'cat_1', 'archived'),
    ];
    const txs = [
      makeTx('pt_pre', 'PA1', 'owedByAccount', 2000, '2026-01-20', 'قبل الفترة'),
      makeTx('pt_in1', 'PA1', 'owedByAccount', 8000, '2026-02-10', 'داخل الفترة أ'),
      makeTx('pt_in2', 'PA2', 'owedToAccount', 3000, '2026-02-12', 'تصنيف آخر'),
      makeTx('pt_in3', 'PA3', 'owedByAccount', 4000, '2026-02-14', 'مؤرشف'),
    ];

    const rPer = generatePeriodSummaryReport(accs, txs, categories, {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      categoryId: 'cat_1',
      status: 'active',
    });

    const passed =
      rPer.rows.length === 1 &&
      rPer.transactionsCount === 1 &&
      rPer.openingBalanceMinor === 12000 && // 10000 + 2000 pre-period
      rPer.totalOwedByMinor === 8000 &&
      rPer.closingBalanceMinor === 20000;

    record(
      'FILTER-14',
      'Period Report Scope: تطبيق التصنيف والحالة والتاريخ بدقة وحساب الافتتاحي الصحيح',
      passed,
      `txCount=${rPer.transactionsCount}, opening=${rPer.openingBalanceMinor}, owedBy=${rPer.totalOwedByMinor}, closing=${rPer.closingBalanceMinor}`
    );
  }

  // =========================================================================
  // FILTER-15: Debtors & Creditors (excludes zero balances & respects scope)
  // =========================================================================
  {
    const accs = [
      makeAccount('DC1', 'مدين نشط', null, 20000, 'cat_1', 'active'),
      makeAccount('DC2', 'متزن مسوى', null, 5000, 'cat_1', 'active'),
      makeAccount('DC3', 'دائن نشط', null, -15000, 'cat_2', 'active'),
      makeAccount('DC4', 'مدين مؤرشف', null, 40000, 'cat_1', 'archived'),
    ];
    const txs = [makeTx('dct1', 'DC2', 'owedToAccount', 5000, '2026-02-05', 'تصفير الرصيد')];

    const rDcActiveCat1 = generateDebtorsCreditorsReport(accs, txs, categories, {
      toDate: '2026-02-28',
      categoryId: 'cat_1',
      status: 'active',
    });

    const passed =
      rDcActiveCat1.debtors.length === 1 &&
      rDcActiveCat1.debtors[0].account.id === 'DC1' &&
      rDcActiveCat1.creditors.length === 0 && // DC3 excluded by cat_1 filter
      !rDcActiveCat1.debtors.some((d) => d.account.id === 'DC2') && // Zero balance excluded
      !rDcActiveCat1.debtors.some((d) => d.account.id === 'DC4'); // Archived excluded

    record(
      'FILTER-15',
      'Debtors/Creditors Scope: استبعاد الأرصدة الصفرية وتطبيق التصنيف والحالة وتاريخ القطع',
      passed,
      `debtors=${rDcActiveCat1.debtors.length}, creditors=${rDcActiveCat1.creditors.length}`
    );
  }

  return { passedCount, failedCount, results };
}
