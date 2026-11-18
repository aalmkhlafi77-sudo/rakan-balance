/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Hierarchical Accounts & Multi-Sheet Excel Test Suite
 * Tests HIER-01..HIER-10 + Comprehensive Verification Tests A–J:
 * - Basic, 4-level deep, direct+child, mixed positive/negative consolidated balances
 * - No double counting, historical cutoff, consolidated statements, cycle guard
 * - TEST A: Opening-at-period vs original opening balance
 * - TEST B: Consolidated opening balance across subtree before fromDate
 * - TEST C: Archived child scoping ('active' excludes archived child vs 'all' includes it)
 * - TEST D: Direct Excel workbook isolation (no branches/child movements)
 * - TEST E: Consolidated Excel workbook completeness (includes branches & consolidated movements)
 * - TEST F: CSV formula injection protection & AccountModel.notes privacy
 * - TEST G: No double count across dashboard, report rows, and root totals
 * - TEST H: Direct equation (OpeningAtPeriod + OwedBy - OwedTo === ClosingDirectBalance)
 * - TEST I: Consolidated equation (ConsolidatedOpening + ConsolidatedOwedBy - ConsolidatedOwedTo === ConsolidatedClosing)
 * - TEST J: Full ExcelJS programmatic load-back verification (6 exact sheets in order, RTL, freeze panes,
 *           tabular AutoFilter, #,##0.00, indentation, borders, widths, injection protection, zero notes leak)
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import { calculateAccountStatement, calculateDashboardSummary } from '../domain/balance_calculator.ts';
import {
  buildConsolidatedStatementCSV,
  buildStatementCSV,
} from '../domain/account_privacy.ts';
import {
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
} from '../domain/financial_reports.ts';
import {
  calculateConsolidatedBalance,
  calculateConsolidatedStatement,
  calculateHistoricalConsolidatedBalance,
  createHierarchyIndex,
  flattenAccountsInTreeOrder,
  formatAccountPath,
  getAccountDepth,
  getDescendantAccountIds,
  generateHierarchicalAccountsReport,
} from '../domain/hierarchical_accounts.ts';
import {
  createComprehensiveAccountsWorkbook,
  createConsolidatedParentAccountWorkbook,
  createDirectAccountWorkbook,
  createSingleParentAccountWorkbook,
} from '../services/excel_export.ts';

export interface HierarchicalTestResult {
  passedCount: number;
  failedCount: number;
  results: { id: string; name: string; passed: boolean; message: string }[];
}

function makeAccount(
  id: string,
  name: string,
  parentId: string | null,
  openingBalanceMinor = 0,
  categoryId = 'cat_1',
  notes?: string,
  status: 'active' | 'archived' = 'active'
): AccountModel {
  return {
    id,
    name,
    parentId,
    categoryId,
    openingBalanceMinor,
    status,
    notes,
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
  description = 'حركة تجريبية',
  transferId?: string
): TransactionModel {
  return {
    id,
    accountId,
    entryType,
    amountMinor,
    date,
    description,
    attachmentIds: [],
    transferId,
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
  };
}

export async function runHierarchicalAccountsTestSuite(): Promise<HierarchicalTestResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function record(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  const categories: CategoryModel[] = [
    { id: 'cat_1', name: 'شركات وعملاء', sortOrder: 1 },
    { id: 'cat_2', name: 'موردون', sortOrder: 2 },
  ];

  // -------------------------------------------------------------------------
  // Test 1: Basic Consolidated Balance (Parent 0, C1 +200, C2 +400 => +600)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'شركة أ', null, 0),
      makeAccount('c1', 'فرع 1', 'p', 20000),
      makeAccount('c2', 'فرع 2', 'p', 40000),
    ];
    const txs: TransactionModel[] = [];
    const index = createHierarchyIndex(accs, txs);
    const directP = index.getDirectBalance('p');
    const consolidatedP = calculateConsolidatedBalance('p', accs, txs, index);
    const passed = directP === 0 && consolidatedP === 60000;
    record(
      'HIER-01',
      'Test 1: Basic consolidated balance (Direct=0, C1=+200, C2=+400 => Consolidated=+600)',
      passed,
      `directP=${directP}, consolidatedP=${consolidatedP}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 2: Deep Hierarchy (4 levels: A -> B -> C -> D)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('A', 'مجموعة أ', null, 0),
      makeAccount('B', 'قطاع ب', 'A', 10000),
      makeAccount('C', 'فرع ج', 'B', 15000),
      makeAccount('D', 'مندوب د', 'C', 5000),
    ];
    const txs: TransactionModel[] = [];
    const consA = calculateConsolidatedBalance('A', accs, txs);
    const consB = calculateConsolidatedBalance('B', accs, txs);
    const consC = calculateConsolidatedBalance('C', accs, txs);
    const consD = calculateConsolidatedBalance('D', accs, txs);
    const descA = getDescendantAccountIds('A', accs);
    const pathD = formatAccountPath('D', accs);
    const depthD = getAccountDepth('D', accs);

    const passed =
      consA === 30000 &&
      consB === 30000 &&
      consC === 20000 &&
      consD === 5000 &&
      descA.length === 3 &&
      pathD === 'مجموعة أ > قطاع ب > فرع ج > مندوب د' &&
      depthD === 3;
    record(
      'HIER-02',
      'Test 2: 4-level deep hierarchy consolidated balances, path, and depth',
      passed,
      `consA=${consA}, consB=${consB}, consC=${consC}, consD=${consD}, depthD=${depthD}, path="${pathD}"`
    );
  }

  // -------------------------------------------------------------------------
  // Test 3: Parent direct (+300) + Child (+200) => Consolidated (+500), Direct (+300)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'الأب', null, 10000),
      makeAccount('c', 'الفرع', 'p', 0),
    ];
    const txs = [
      makeTx('t1', 'p', 'owedByAccount', 20000, '2026-01-05'),
      makeTx('t2', 'c', 'owedByAccount', 20000, '2026-01-06'),
    ];
    const index = createHierarchyIndex(accs, txs);
    const directP = index.getDirectBalance('p');
    const consolidatedP = calculateConsolidatedBalance('p', accs, txs, index);
    const passed = directP === 30000 && consolidatedP === 50000;
    record(
      'HIER-03',
      'Test 3: Parent direct balance (+300) + Child (+200) => Consolidated (+500)',
      passed,
      `directP=${directP}, consolidatedP=${consolidatedP}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 4: Positive + Negative balances in same subtree (+500 + -200 => +300)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'الرئيسي', null, 0),
      makeAccount('c1', 'فرع موجب', 'p', 50000),
      makeAccount('c2', 'فرع سالب', 'p', -20000),
    ];
    const consolidatedP = calculateConsolidatedBalance('p', accs, []);
    const passed = consolidatedP === 30000;
    record(
      'HIER-04',
      'Test 4: Mixed positive & negative child balances (+500 + -200 => +300)',
      passed,
      `consolidatedP=${consolidatedP}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 5: No Double Counting in Dashboard & Existing Financial Reports
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'شركة رئيسية', null, 0),
      makeAccount('c1', 'فرع 1', 'p', 20000),
      makeAccount('c2', 'فرع 2', 'p', 40000),
    ];
    const txs: TransactionModel[] = [];

    const dash = calculateDashboardSummary(accs, txs);
    const accReport = generateAccountsBalanceReport(accs, txs, categories, { status: 'active' });
    const catReport = generateCategorySummaryReport(accs, txs, categories);
    const hierReport = generateHierarchicalAccountsReport(accs, txs, categories, { status: 'active' });
    const parentRow = hierReport.rows.find((r) => r.account.id === 'p');

    const passed =
      dash.totalReceivableMinor === 60000 &&
      dash.netBalanceMinor === 60000 &&
      accReport.totalReceivableMinor === 60000 &&
      catReport.grandTotalReceivableMinor === 60000 &&
      hierReport.totalDirectReceivableMinor === 60000 &&
      parentRow?.directBalanceMinor === 0 &&
      parentRow?.consolidatedBalanceMinor === 60000;

    record(
      'HIER-05',
      'Test 5: No double counting in Dashboard, Reports, and Hierarchical summary totals (+600 not +1200)',
      passed,
      `dash=${dash.totalReceivableMinor}, accReport=${accReport.totalReceivableMinor}, hierDirectTotal=${hierReport.totalDirectReceivableMinor}, parentCons=${parentRow?.consolidatedBalanceMinor}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 6: Historical Cutoff Consolidated Balance
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'الأب', null, 0),
      makeAccount('c', 'الفرع', 'p', 0),
    ];
    const txs = [
      makeTx('t1', 'p', 'owedByAccount', 10000, '2026-01-05'),
      makeTx('t2', 'c', 'owedByAccount', 20000, '2026-01-10'),
      makeTx('t3', 'c', 'owedByAccount', 50000, '2026-02-01'),
    ];
    const atJan15 = calculateHistoricalConsolidatedBalance('p', accs, txs, '2026-01-15');
    const full = calculateHistoricalConsolidatedBalance('p', accs, txs);
    const reportJan15 = generateHierarchicalAccountsReport(accs, txs, categories, {
      status: 'active',
      toDate: '2026-01-15',
    });
    const parentJan15 = reportJan15.rows.find((r) => r.account.id === 'p');

    const passed =
      atJan15 === 30000 &&
      full === 80000 &&
      parentJan15?.consolidatedBalanceMinor === 30000;
    record(
      'HIER-06',
      'Test 6: Historical cutoff excludes post-toDate child & parent movements',
      passed,
      `atJan15=${atJan15}, full=${full}, reportParentJan15=${parentJan15?.consolidatedBalanceMinor}`
    );
  }

  // -------------------------------------------------------------------------
  // Test 7: Consolidated Statement (Subtree isolation, opening/closing, paths)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p', 'شركة النور', null, 10000),
      makeAccount('c1', 'فرع الرياض', 'p', 0),
      makeAccount('gc1', 'مندوب 1', 'c1', 0),
      makeAccount('other', 'حساب خارجي مستقل', null, 50000),
    ];
    const txs = [
      makeTx('t_before', 'c1', 'owedByAccount', 20000, '2026-01-05', 'حركة قبل الفترة'),
      makeTx('t_other', 'other', 'owedByAccount', 99900, '2026-01-12', 'حركة خارج الشجرة'),
      makeTx('t_gc', 'gc1', 'owedByAccount', 30000, '2026-01-15', 'مبيعات مندوب 1'),
      makeTx('t_c1', 'c1', 'owedToAccount', 5000, '2026-01-20', 'سداد فرع الرياض'),
      makeTx('t_after', 'p', 'owedByAccount', 40000, '2026-02-05', 'حركة بعد الفترة'),
    ];

    const stmt = calculateConsolidatedStatement('p', accs, txs, '2026-01-10', '2026-01-31');
    const rowIds = stmt.rows.map((r) => r.transaction.id);
    const firstRow = stmt.rows[0];
    const secondRow = stmt.rows[1];

    const passed =
      stmt.descendantCount === 2 &&
      stmt.openingConsolidatedBalanceMinor === 30000 &&
      stmt.totalOwedByMinor === 30000 &&
      stmt.totalOwedToMinor === 5000 &&
      stmt.netPeriodMovementMinor === 25000 &&
      stmt.closingConsolidatedBalanceMinor === 55000 &&
      rowIds.length === 2 &&
      rowIds[0] === 't_gc' &&
      rowIds[1] === 't_c1' &&
      !rowIds.includes('t_other') &&
      firstRow?.sourceAccountName === 'مندوب 1' &&
      firstRow?.hierarchicalPath === 'شركة النور > فرع الرياض > مندوب 1' &&
      firstRow?.runningConsolidatedBalanceMinor === 60000 &&
      secondRow?.runningConsolidatedBalanceMinor === 55000;

    record(
      'HIER-07',
      'Test 7: Consolidated statement subtree isolation, opening/closing, and hierarchical paths',
      passed,
      `opening=${stmt.openingConsolidatedBalanceMinor}, closing=${stmt.closingConsolidatedBalanceMinor}, rows=${rowIds.join(',')}, path="${firstRow?.hierarchicalPath}"`
    );
  }

  // -------------------------------------------------------------------------
  // TEST A: Opening-at-Period Balance vs Original Opening Balance
  // -------------------------------------------------------------------------
  {
    const accs = [makeAccount('a', 'شركة أ', null, 100000)]; // Opening = 1,000.00 SAR (100000 minor)
    const txs = [
      makeTx('t_pre', 'a', 'owedByAccount', 400000, '2026-01-05', 'مبيعات قبل الفترة'), // +4,000.00
      makeTx('t_in', 'a', 'owedByAccount', 200000, '2026-01-20', 'مبيعات خلال الفترة'), // +2,000.00
    ];
    const report = generateHierarchicalAccountsReport(accs, txs, categories, {
      status: 'active',
      fromDate: '2026-01-15',
      toDate: '2026-01-31',
    });
    const row = report.rows[0];
    const passed =
      row?.originalOpeningBalanceMinor === 100000 &&
      row?.openingAtPeriodMinor === 500000 &&
      row?.directOpeningMinor === 500000 &&
      row?.directOwedByMinor === 200000 &&
      row?.directBalanceMinor === 700000;

    record(
      'TEST-A',
      'TEST A: Opening-at-period calculation (1000 + 4000 pre-period = 5000 opening, +2000 in-period = 7000 closing)',
      passed,
      `origOpen=${row?.originalOpeningBalanceMinor}, openAtPeriod=${row?.openingAtPeriodMinor}, inOwedBy=${row?.directOwedByMinor}, closing=${row?.directBalanceMinor}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST B: Consolidated Opening Across Subtree
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('A', 'مجموعة أ', null, 100000), // +1,000
      makeAccount('B', 'فرع ب', 'A', 200000), // +2,000
    ];
    const txs = [
      makeTx('tb_pre', 'B', 'owedByAccount', 300000, '2026-01-05', 'حركة فرع قبل الفترة'), // +3,000
      makeTx('tb_in', 'B', 'owedByAccount', 100000, '2026-01-20', 'حركة فرع داخل الفترة'), // +1,000
    ];
    const report = generateHierarchicalAccountsReport(accs, txs, categories, {
      status: 'active',
      fromDate: '2026-01-15',
      toDate: '2026-01-31',
    });
    const rowA = report.rows.find((r) => r.account.id === 'A');
    const stmtA = calculateConsolidatedStatement('A', accs, txs, '2026-01-15', '2026-01-31', 'active');

    const passed =
      rowA?.consolidatedOpeningAtPeriodMinor === 600000 &&
      rowA?.consolidatedBalanceMinor === 700000 &&
      stmtA.openingConsolidatedBalanceMinor === 600000 &&
      stmtA.closingConsolidatedBalanceMinor === 700000;

    record(
      'TEST-B',
      'TEST B: Consolidated opening across parent & child pre-period movements (1000 + 2000 + 3000 = 6000)',
      passed,
      `reportConsOpen=${rowA?.consolidatedOpeningAtPeriodMinor}, stmtConsOpen=${stmtA.openingConsolidatedBalanceMinor}, closing=${rowA?.consolidatedBalanceMinor}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST C: Archived Child Exclusion ('active') vs Inclusion ('all')
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('A', 'رئيسي نشط', null, 0, 'cat_1', undefined, 'active'),
      makeAccount('B', 'فرع مؤرشف', 'A', 20000, 'cat_1', undefined, 'archived'),
    ];
    const activeReport = generateHierarchicalAccountsReport(accs, [], categories, { status: 'active' });
    const allReport = generateHierarchicalAccountsReport(accs, [], categories, { status: 'all' });

    const aInActive = activeReport.rows.find((r) => r.account.id === 'A');
    const aInAll = allReport.rows.find((r) => r.account.id === 'A');
    const helperActive = calculateConsolidatedBalance('A', accs, [], 'active');
    const helperAll = calculateConsolidatedBalance('A', accs, [], 'all');

    const passed =
      activeReport.rows.length === 1 &&
      aInActive?.consolidatedBalanceMinor === 0 &&
      aInActive?.descendantCount === 0 &&
      helperActive === 0 &&
      allReport.rows.length === 2 &&
      aInAll?.consolidatedBalanceMinor === 20000 &&
      aInAll?.descendantCount === 1 &&
      helperAll === 20000;

    record(
      'TEST-C',
      'TEST C: Archived child excluded when filter=active (0) and included when filter=all (+20,000)',
      passed,
      `activeCons=${aInActive?.consolidatedBalanceMinor} (desc=${aInActive?.descendantCount}), allCons=${aInAll?.consolidatedBalanceMinor} (desc=${aInAll?.descendantCount})`
    );
  }

  // -------------------------------------------------------------------------
  // TEST D & E: Direct vs Consolidated Excel Workbooks Isolation Check
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('P', 'الشركة الأم', null, 50000, 'cat_1', 'SECRET_NOTE_P'),
      makeAccount('C', 'الفرع المستبعد بالمباشر', 'P', 30000, 'cat_1', 'SECRET_NOTE_C'),
    ];
    const txs = [
      makeTx('tp', 'P', 'owedByAccount', 10000, '2026-01-10', 'حركة مباشرة للأم'),
      makeTx('tc', 'C', 'owedByAccount', 25000, '2026-01-12', 'حركة تابعة للفرع فقط'),
    ];

    // TEST D: Direct workbook must ONLY include P and its direct movement (NO C, NO 'الفروع', NO 'الحركات المجمعة')
    const directWb = createDirectAccountWorkbook({
      accountId: 'P',
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
    });
    const directBuf = await directWb.xlsx.writeBuffer();
    const readDirect = new ExcelJS.Workbook();
    await readDirect.xlsx.load(directBuf as ArrayBuffer);

    const directSheets = readDirect.worksheets.map((w) => w.name);
    let directLeakedChild = false;
    let directHasOwnMovement = false;
    let directLeakedNote = false;

    for (const ws of readDirect.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const text = String(cell.value ?? '');
          if (text.includes('الفرع المستبعد بالمباشر') || text.includes('حركة تابعة للفرع فقط')) {
            directLeakedChild = true;
          }
          if (text.includes('حركة مباشرة للأم')) {
            directHasOwnMovement = true;
          }
          if (text.includes('SECRET_NOTE')) {
            directLeakedNote = true;
          }
        });
      });
    }

    const testDPassed =
      !directSheets.includes('الفروع') &&
      !directSheets.includes('الحركات المجمعة') &&
      directSheets.includes('ملخص الحساب') &&
      directSheets.includes('الحركات') &&
      directSheets.includes('الأرصدة') &&
      !directLeakedChild &&
      directHasOwnMovement &&
      !directLeakedNote;

    record(
      'TEST-D',
      'TEST D: Direct Excel workbook strictly excludes child branches & branch movements',
      testDPassed,
      `sheets=[${directSheets.join(', ')}], leakedChild=${directLeakedChild}, hasOwn=${directHasOwnMovement}`
    );

    // TEST E: Consolidated workbook MUST include P, branch C, branch movements, and consolidated totals
    const consWb = createConsolidatedParentAccountWorkbook({
      accountId: 'P',
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
    });
    const consBuf = await consWb.xlsx.writeBuffer();
    const readCons = new ExcelJS.Workbook();
    await readCons.xlsx.load(consBuf as ArrayBuffer);

    const consSheets = readCons.worksheets.map((w) => w.name);
    let hasChildInBranches = false;
    let hasChildMovementInMov = false;
    const branchesWs = readCons.getWorksheet('الفروع');
    const consMovWs = readCons.getWorksheet('الحركات المجمعة');

    branchesWs?.eachRow((r) => {
      r.eachCell((c) => {
        if (String(c.value ?? '').includes('الفرع المستبعد بالمباشر')) hasChildInBranches = true;
      });
    });
    consMovWs?.eachRow((r) => {
      r.eachCell((c) => {
        if (String(c.value ?? '').includes('حركة تابعة للفرع فقط')) hasChildMovementInMov = true;
      });
    });

    const testEPassed =
      consSheets.includes('ملخص الحساب') &&
      consSheets.includes('الفروع') &&
      consSheets.includes('الحركات المجمعة') &&
      consSheets.includes('الأرصدة') &&
      hasChildInBranches &&
      hasChildMovementInMov;

    record(
      'TEST-E',
      'TEST E: Consolidated Excel workbook includes parent, descendants, and consolidated movements',
      testEPassed,
      `sheets=[${consSheets.join(', ')}], childInBranches=${hasChildInBranches}, childInMov=${hasChildMovementInMov}`
    );

    // Preserve HIER-09B check for leaf account omitting empty sheets
    const leafAcc = makeAccount('Z', 'حساب مستقل فارغ', null, 0);
    const leafWb = createSingleParentAccountWorkbook({
      accountId: 'Z',
      accounts: [leafAcc],
      transactions: [],
      categories,
      currencySymbol: 'ر.س',
    });
    const leafSheets = leafWb.worksheets.map((w) => w.name);
    const hier09BPassed =
      consSheets.includes('ملخص الحساب') &&
      leafSheets.includes('ملخص الحساب') &&
      leafSheets.includes('الأرصدة') &&
      !leafSheets.includes('الفروع') &&
      !leafSheets.includes('الحركات المجمعة');

    record(
      'HIER-09B',
      'Test 9B: Single-Parent Consolidated Excel workbook & empty-sheet omission for leaf accounts',
      hier09BPassed,
      `parentSheets=[${consSheets.join(', ')}], leafSheets=[${leafSheets.join(', ')}]`
    );
  }

  // -------------------------------------------------------------------------
  // TEST F: CSV Formula Injection Protection & Notes Privacy
  // -------------------------------------------------------------------------
  {
    const evilParent = makeAccount('ep', '=SUM(A1:A5)', null, 0, 'cat_1', 'PRIVATE_CSV_NOTE');
    const evilChild = makeAccount('ec', '@HYPERLINK("x")', 'ep', 0, 'cat_1', 'PRIVATE_CHILD_NOTE');
    const evilTxs = [
      makeTx('et1', 'ep', 'owedByAccount', 10000, '2026-01-10', '+CMD("calc")'),
      makeTx('et2', 'ec', 'owedToAccount', 5000, '2026-01-11', '-1+2+3'),
    ];
    const directStmt = calculateAccountStatement(evilParent, evilTxs);
    const consStmt = calculateConsolidatedStatement('ep', [evilParent, evilChild], evilTxs);

    const directCsv = buildStatementCSV(evilParent, [evilParent, evilChild], directStmt);
    const consCsv = buildConsolidatedStatementCSV(evilParent, [evilParent, evilChild], consStmt);

    const directSafe =
      directCsv.includes("'=SUM(A1:A5)") &&
      directCsv.includes("'+CMD(") &&
      !directCsv.includes('PRIVATE_CSV_NOTE') &&
      !directCsv.includes(',"+CMD');

    const consSafe =
      consCsv.includes("'=SUM(A1:A5)") &&
      consCsv.includes("'@HYPERLINK") &&
      consCsv.includes("'+CMD(") &&
      consCsv.includes("'-1+2+3") &&
      !consCsv.includes('PRIVATE_CSV_NOTE') &&
      !consCsv.includes('PRIVATE_CHILD_NOTE');

    record(
      'TEST-F',
      'TEST F: CSV Formula Injection (=, +, -, @) neutralized & AccountModel.notes never leaked in direct/consolidated CSV',
      directSafe && consSafe,
      `directSafe=${directSafe}, consSafe=${consSafe}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST G: No Double Counting across Multi-Level Hierarchy & Root Totals
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('R1', 'جذر أول', null, 10000), // direct +100
      makeAccount('B1', 'فرع 1', 'R1', 20000), // direct +200
      makeAccount('GB1', 'حفيد 1', 'B1', 30000), // direct +300
      makeAccount('R2', 'جذر ثاني', null, -15000), // direct -150
    ];
    const dash = calculateDashboardSummary(accs, []);
    const report = generateHierarchicalAccountsReport(accs, [], categories, { status: 'active' });
    const rootsSumConsolidated = report.rootSummaries.reduce((s, r) => s + r.consolidatedBalanceMinor, 0);

    const passed =
      dash.totalReceivableMinor === 60000 &&
      dash.totalPayableMinor === 15000 &&
      dash.netBalanceMinor === 45000 &&
      report.totalDirectReceivableMinor === 60000 &&
      report.totalDirectPayableMinor === 15000 &&
      report.netDirectBalanceMinor === 45000 &&
      rootsSumConsolidated === 45000;

    record(
      'TEST-G',
      'TEST G: Strict zero double counting in Dashboard, Detailed Direct Totals, and Disjoint Root Summaries',
      passed,
      `dashNet=${dash.netBalanceMinor}, reportDirectNet=${report.netDirectBalanceMinor}, rootsConsSum=${rootsSumConsolidated}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST H & I: Mathematical Balance Equations (Direct Rows + Consolidated Parents)
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p1', 'شركة الرياض', null, 15000),
      makeAccount('b1', 'فرع شمال', 'p1', 25000),
      makeAccount('gb1', 'مندوب شمال 1', 'b1', -5000),
      makeAccount('p2', 'مؤسسة الخليج', null, 0),
    ];
    const txs = [
      makeTx('h1', 'p1', 'owedByAccount', 10000, '2026-01-03'),
      makeTx('h2', 'b1', 'owedToAccount', 5000, '2026-01-04'),
      makeTx('h3', 'p1', 'owedByAccount', 30000, '2026-01-12'),
      makeTx('h4', 'b1', 'owedToAccount', 12000, '2026-01-15'),
      makeTx('h5', 'gb1', 'owedByAccount', 18000, '2026-01-18'),
      makeTx('h6', 'p2', 'owedToAccount', 9000, '2026-01-20'),
      makeTx('h7', 'p2', 'owedByAccount', 2000, '2026-01-25'),
    ];

    const report = generateHierarchicalAccountsReport(accs, txs, categories, {
      status: 'active',
      fromDate: '2026-01-10',
      toDate: '2026-01-31',
    });

    const everyRowMatchesDirectEquation =
      report.rows.length === 4 &&
      report.rows.every(
        (r) =>
          r.openingAtPeriodMinor + r.directOwedByMinor - r.directOwedToMinor ===
          r.directBalanceMinor
      );

    const reportTotalMatches =
      report.totalOpeningAtPeriodMinor +
        report.totalPeriodOwedByMinor -
        report.totalPeriodOwedToMinor ===
      report.totalClosingDirectBalanceMinor;

    record(
      'TEST-H',
      'TEST H: Direct Report Equation (OpeningAtPeriod + OwedBy - OwedTo === ClosingDirectBalance) holds for every row & total',
      everyRowMatchesDirectEquation && reportTotalMatches,
      `rowsEq=${everyRowMatchesDirectEquation}, totalEq=${reportTotalMatches}`
    );

    const parentRows = report.rows.filter((r) => r.isParent);
    const everyParentMatchesConsEquation =
      parentRows.length === 2 &&
      parentRows.every(
        (r) =>
          r.consolidatedOpeningAtPeriodMinor +
            r.consolidatedOwedByMinor -
            r.consolidatedOwedToMinor ===
          r.consolidatedBalanceMinor
      );

    const stmtP1 = calculateConsolidatedStatement('p1', accs, txs, '2026-01-10', '2026-01-31', 'active');
    const stmtEqMatches =
      stmtP1.openingConsolidatedBalanceMinor + stmtP1.totalOwedByMinor - stmtP1.totalOwedToMinor ===
      stmtP1.closingConsolidatedBalanceMinor;

    record(
      'TEST-I',
      'TEST I: Consolidated Equation (ConsOpening + ConsOwedBy - ConsOwedTo === ConsClosing) holds for all parents & statement',
      everyParentMatchesConsEquation && stmtEqMatches,
      `parentsEq=${everyParentMatchesConsEquation}, stmtEq=${stmtEqMatches}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST 8, TEST 9A & TEST J: Comprehensive 6-Sheet Workbook Programmatic Verification
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p1', 'شركة المستقبل', null, 10000, 'cat_1', 'SECRET_PRIVATE_NOTE_1'),
      makeAccount('b1', 'فرع جدة', 'p1', 0, 'cat_1', 'SECRET_PRIVATE_NOTE_2'),
      makeAccount('gb1', '=SUM(A1)', 'b1', 15000, 'cat_1'),
      makeAccount('p2', 'مؤسسة الرواد', null, -25000, 'cat_2'),
      makeAccount('zero', 'حساب متزن', null, 0, 'cat_1'),
    ];
    const txs = [
      makeTx('tx0', 'p1', 'owedByAccount', 5000, '2026-01-01', 'قيد قبل الفترة'),
      makeTx('tx1', 'p1', 'owedByAccount', 30000, '2026-01-05', 'فاتورة أصلية'),
      makeTx('tx2', 'b1', 'owedByAccount', 20000, '2026-01-10', '+HYPERLINK("http://evil","click")'),
      makeTx('tx3', 'gb1', 'owedToAccount', 5000, '2026-01-12', 'خصم فرع', 'tr_1'),
    ];

    const compWb = createComprehensiveAccountsWorkbook({
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
      currencyName: 'ريال سعودي',
      ownerName: 'راكان',
      filterOptions: { status: 'active', fromDate: '2026-01-04' },
    });

    const compBuffer = await compWb.xlsx.writeBuffer();
    const readCompWb = new ExcelJS.Workbook();
    await readCompWb.xlsx.load(compBuffer as ArrayBuffer);

    const expectedOrder = [
      'الملخص العام',
      'ملخص الحسابات الرئيسية',
      'الأرصدة التفصيلية',
      'الشجرة المالية',
      'الحركات',
      'التحليل المالي',
    ];
    const tabularSheets = [
      'ملخص الحسابات الرئيسية',
      'الأرصدة التفصيلية',
      'الشجرة المالية',
      'الحركات',
    ];
    const dashboardOrSectionSheets = ['الملخص العام', 'التحليل المالي'];

    const actualSheetNames = readCompWb.worksheets.map((ws) => ws.name);
    const exactOrderMatches =
      actualSheetNames.length === expectedOrder.length &&
      expectedOrder.every((name, idx) => actualSheetNames[idx] === name);

    let allRtl = true;
    let allFrozen = true;
    let tabularAutoFilterOk = true;
    let nonTabularNoAutoFilterOk = true;
    let allNonEmpty = true;
    let allWidthsValid = true;
    let allBordersPresent = true;
    let noDataRowMerges = true;
    let formulaInjectionEscaped = true;
    let notesHidden = true;

    for (const ws of readCompWb.worksheets) {
      if (ws.rowCount <= 4) allNonEmpty = false;
      const view = ws.views?.[0] as any;
      if (!view?.rightToLeft) allRtl = false;
      if (view?.state !== 'frozen' || view?.ySplit !== 4) allFrozen = false;

      if (tabularSheets.includes(ws.name) && !ws.autoFilter) {
        tabularAutoFilterOk = false;
      }
      if (dashboardOrSectionSheets.includes(ws.name) && ws.autoFilter) {
        nonTabularNoAutoFilterOk = false;
      }

      for (let c = 1; c <= ws.columnCount; c++) {
        const w = ws.getColumn(c).width;
        if (!w || w < 8) allWidthsValid = false;
      }

      // Ensure no merges inside data rows (rows >= 4)
      const merges = (ws.model as any)?.merges as string[] | undefined;
      if (merges) {
        for (const m of merges) {
          const match = m.match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/);
          if (match) {
            const startR = Number(match[1]);
            const endR = Number(match[2]);
            if (startR >= 4 || endR >= 4) {
              noDataRowMerges = false;
            }
          }
        }
      }

      ws.eachRow((row, rowNum) => {
        row.eachCell((cell) => {
          if (rowNum >= 4 && (!cell.border || !cell.border.top || !cell.border.bottom)) {
            allBordersPresent = false;
          }
          const val = cell.value;
          if (typeof val === 'string') {
            if (/^[=+\-@\t\r]/.test(val)) {
              formulaInjectionEscaped = false;
            }
            if (val.includes('SECRET_PRIVATE_NOTE')) {
              notesHidden = false;
            }
          }
          if (typeof val === 'object' && val !== null && 'formula' in val) {
            formulaInjectionEscaped = false;
          }
        });
      });
    }

    const detailSheet = readCompWb.getWorksheet('الأرصدة التفصيلية');
    const rootSheet = readCompWb.getWorksheet('ملخص الحسابات الرئيسية');
    const treeSheet = readCompWb.getWorksheet('الشجرة المالية');
    let numericFormatOk = true;
    let treeIndentOk = false;
    let formulaCellFound = false;
    let totalsNoDoubleCount = false;

    if (detailSheet) {
      // Row 5 col 5=Opening, col 9=Closing
      const openCell = detailSheet.getRow(5).getCell(5);
      const closeCell = detailSheet.getRow(5).getCell(9);
      if (
        typeof openCell.value !== 'number' ||
        openCell.numFmt !== '#,##0.00' ||
        typeof closeCell.value !== 'number' ||
        closeCell.numFmt !== '#,##0.00'
      ) {
        numericFormatOk = false;
      }
      // Check totals row direct closing balance = (100+50+300) + 200 + (150-50) - 250 + 0 = 500 SAR
      const totalClosingCell = detailSheet.getRow(detailSheet.rowCount).getCell(9);
      if (totalClosingCell.value === 500) {
        totalsNoDoubleCount = true;
      }
    } else {
      numericFormatOk = false;
    }

    // Verify Root Summary sheet Totals row also equals 500 SAR (not doubled!)
    if (rootSheet) {
      const rootTotalCons = rootSheet.getRow(rootSheet.rowCount).getCell(11);
      if (rootTotalCons.value !== 500) {
        totalsNoDoubleCount = false;
      }
    } else {
      totalsNoDoubleCount = false;
    }

    if (treeSheet) {
      for (let r = 5; r <= treeSheet.rowCount; r++) {
        const nameCell = treeSheet.getRow(r).getCell(1);
        const consCell = treeSheet.getRow(r).getCell(8); // الرصيد المجمع
        if (typeof consCell.value !== 'number' || consCell.numFmt !== '#,##0.00') {
          numericFormatOk = false;
        }
        if (String(nameCell.value).includes('=SUM(A1)')) {
          formulaCellFound = true;
          if (String(nameCell.value) !== "'=SUM(A1)") {
            formulaInjectionEscaped = false;
          }
          if ((nameCell.alignment?.indent || 0) >= 2) {
            treeIndentOk = true;
          }
        }
      }
    }

    record(
      'HIER-08',
      'Test 8: Comprehensive 6-sheet Excel workbook generation & exact sheet order',
      exactOrderMatches && allNonEmpty && formulaCellFound,
      `sheets=[${actualSheetNames.join(', ')}], formulaCellFound=${formulaCellFound}`
    );

    record(
      'HIER-09A',
      'Test 9A / TEST J: ExcelJS load-back (RTL, freeze, tabular AutoFilter, #,##0.00, borders, indent, widths, no data merges, injection & privacy, non-double Totals)',
      allRtl &&
        allFrozen &&
        tabularAutoFilterOk &&
        nonTabularNoAutoFilterOk &&
        allNonEmpty &&
        allWidthsValid &&
        allBordersPresent &&
        noDataRowMerges &&
        numericFormatOk &&
        treeIndentOk &&
        formulaInjectionEscaped &&
        notesHidden &&
        totalsNoDoubleCount,
      `rtl=${allRtl}, frozen=${allFrozen}, tabFilter=${tabularAutoFilterOk}, dashNoFilter=${nonTabularNoAutoFilterOk}, borders=${allBordersPresent}, widths=${allWidthsValid}, noMerges=${noDataRowMerges}, numFmt=${numericFormatOk}, indent=${treeIndentOk}, safe=${formulaInjectionEscaped}, privacy=${notesHidden}, noDoubleTotals=${totalsNoDoubleCount}`
    );

    record(
      'TEST-J',
      'TEST J: Comprehensive 6-sheet Executive Workbook audit (order, dashboard sections, root summary, equations, styling)',
      exactOrderMatches &&
        tabularAutoFilterOk &&
        nonTabularNoAutoFilterOk &&
        numericFormatOk &&
        totalsNoDoubleCount &&
        formulaInjectionEscaped &&
        notesHidden,
      `order=${exactOrderMatches}, sheets=[${actualSheetNames.join(' -> ')}], totalsNoDouble=${totalsNoDoubleCount}`
    );
  }

  // -------------------------------------------------------------------------
  // Bonus Test: Circular Reference Resilience
  // -------------------------------------------------------------------------
  {
    const cyclicAccounts = [
      makeAccount('x', 'حساب س', 'y', 10000),
      makeAccount('y', 'حساب ص', 'x', 20000),
    ];
    const descX = getDescendantAccountIds('x', cyclicAccounts);
    const consX = calculateConsolidatedBalance('x', cyclicAccounts, []);
    const flat = flattenAccountsInTreeOrder(cyclicAccounts);

    const passed = descX.length === 1 && descX[0] === 'y' && consX === 30000 && flat.length === 2;
    record(
      'HIER-10',
      'Cycle Guard: Circular parent links terminate safely without infinite recursion',
      passed,
      `descX=[${descX.join(',')}], consX=${consX}, flattened=${flat.length}`
    );
  }

  return { passedCount, failedCount, results };
}
