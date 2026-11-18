/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Hierarchical Accounts & Multi-Sheet Excel Test Suite
 * Tests 1–9 + Cycle Safety & Privacy Guard:
 * 1. Basic consolidated balance
 * 2. 4-level deep hierarchy consolidated balance
 * 3. Parent direct balance + child balance
 * 4. Positive + negative subtree balances
 * 5. No double counting in Dashboard & Financial Reports
 * 6. Historical cutoff consolidated balance
 * 7. Consolidated statement subtree isolation, opening/closing, hierarchical path
 * 8. Comprehensive & Single-Parent Excel workbook generation
 * 9. Programmatic ExcelJS verification (RTL, freeze panes, autoFilter, #,##0.00, widths, no empty sheets, formula injection, notes privacy)
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import { calculateDashboardSummary } from '../domain/balance_calculator.ts';
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
  notes?: string
): AccountModel {
  return {
    id,
    name,
    parentId,
    categoryId,
    openingBalanceMinor,
    status: 'active',
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
      makeTx('t1', 'p', 'owedByAccount', 20000, '2026-01-05'), // Parent direct = 100 + 200 = 300
      makeTx('t2', 'c', 'owedByAccount', 20000, '2026-01-06'), // Child direct = 200
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
      makeTx('t3', 'c', 'owedByAccount', 50000, '2026-02-01'), // After cutoff!
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
      makeAccount('p', 'شركة النور', null, 10000), // Opening +100
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
      stmt.openingConsolidatedBalanceMinor === 30000 && // 100 + 200
      stmt.totalOwedByMinor === 30000 &&
      stmt.totalOwedToMinor === 5000 &&
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
  // Test 8 & 9: Multi-Sheet Excel Workbooks + Write/Load Programmatic Verification
  // -------------------------------------------------------------------------
  {
    const accs = [
      makeAccount('p1', 'شركة المستقبل', null, 10000, 'cat_1', 'SECRET_PRIVATE_NOTE_1'),
      makeAccount('b1', 'فرع جدة', 'p1', 0, 'cat_1', 'SECRET_PRIVATE_NOTE_2'),
      makeAccount('gb1', '=SUM(A1)', 'b1', 15000, 'cat_1'), // Formula injection test!
      makeAccount('p2', 'مؤسسة الرواد', null, -25000, 'cat_2'),
      makeAccount('zero', 'حساب متزن', null, 0, 'cat_1'),
    ];
    const txs = [
      makeTx('tx1', 'p1', 'owedByAccount', 30000, '2026-01-05', 'فاتورة أصلية'),
      makeTx('tx2', 'b1', 'owedByAccount', 20000, '2026-01-10', '+HYPERLINK("http://evil","click")'),
      makeTx('tx3', 'gb1', 'owedToAccount', 5000, '2026-01-12', 'خصم فرع', 'tr_1'),
    ];

    // A) Comprehensive 6-Sheet Workbook
    const compWb = createComprehensiveAccountsWorkbook({
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
      currencyName: 'ريال سعودي',
      ownerName: 'راكان',
      filterOptions: { status: 'active' },
    });

    const compBuffer = await compWb.xlsx.writeBuffer();
    const readCompWb = new ExcelJS.Workbook();
    await readCompWb.xlsx.load(compBuffer as ArrayBuffer);

    const expectedSheets = [
      'الملخص العام',
      'الأرصدة التفصيلية',
      'الشجرة المالية',
      'التحليل المالي',
      'ملخص الحسابات الرئيسية',
      'الحركات',
    ];
    const actualSheetNames = readCompWb.worksheets.map((ws) => ws.name);
    const hasAllSheets = expectedSheets.every((name) => actualSheetNames.includes(name));

    let allRtl = true;
    let allFrozen = true;
    let allAutoFilter = true;
    let allNonEmpty = true;
    let allWidthsValid = true;
    let noDataRowMerges = true;
    let formulaInjectionEscaped = true;
    let notesHidden = true;

    for (const ws of readCompWb.worksheets) {
      if (ws.rowCount <= 4) allNonEmpty = false;
      const view = ws.views?.[0] as any;
      if (!view?.rightToLeft) allRtl = false;
      if (view?.state !== 'frozen' || view?.ySplit !== 4) allFrozen = false;
      if (!ws.autoFilter) allAutoFilter = false;

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

      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const val = cell.value;
          if (typeof val === 'string') {
            if (/^[=+\-@\t\r]/.test(val)) {
              formulaInjectionEscaped = false;
            }
            if (val.includes('SECRET_PRIVATE_NOTE')) {
              notesHidden = false;
            }
          }
          // ExcelJS formula objects should never exist either
          if (typeof val === 'object' && val !== null && 'formula' in val) {
            formulaInjectionEscaped = false;
          }
        });
      });
    }

    // Verify numeric formatting (#,##0.00) & tree indentation on الشجرة المالية
    const treeSheet = readCompWb.getWorksheet('الشجرة المالية');
    const detailSheet = readCompWb.getWorksheet('الأرصدة التفصيلية');
    let numericFormatOk = true;
    let treeIndentOk = false;
    let formulaCellFound = false;

    if (detailSheet) {
      const sampleCell = detailSheet.getRow(5).getCell(8); // الرصيد المباشر
      if (typeof sampleCell.value !== 'number' || sampleCell.numFmt !== '#,##0.00') {
        numericFormatOk = false;
      }
    } else {
      numericFormatOk = false;
    }

    if (treeSheet) {
      for (let r = 5; r <= treeSheet.rowCount; r++) {
        const nameCell = treeSheet.getRow(r).getCell(1);
        const consCell = treeSheet.getRow(r).getCell(7);
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
      'Test 8: Comprehensive 6-sheet Excel workbook generation & structure',
      hasAllSheets && allNonEmpty && formulaCellFound,
      `sheets=[${actualSheetNames.join(', ')}], formulaCellFound=${formulaCellFound}`
    );

    record(
      'HIER-09A',
      'Test 9A: ExcelJS load-back verification (RTL, freeze, autoFilter, #,##0.00, indent, widths, no data merges, injection & privacy)',
      allRtl &&
        allFrozen &&
        allAutoFilter &&
        allNonEmpty &&
        allWidthsValid &&
        noDataRowMerges &&
        numericFormatOk &&
        treeIndentOk &&
        formulaInjectionEscaped &&
        notesHidden,
      `rtl=${allRtl}, frozen=${allFrozen}, filter=${allAutoFilter}, widths=${allWidthsValid}, noMerges=${noDataRowMerges}, numFmt=${numericFormatOk}, indent=${treeIndentOk}, safe=${formulaInjectionEscaped}, privacy=${notesHidden}`
    );

    // B) Single-Parent Consolidated Workbook + Empty Sheet Omission Check
    const parentWb = createSingleParentAccountWorkbook({
      accountId: 'p1',
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
      currencyName: 'ريال سعودي',
      ownerName: 'راكان',
    });
    const parentBuffer = await parentWb.xlsx.writeBuffer();
    const readParentWb = new ExcelJS.Workbook();
    await readParentWb.xlsx.load(parentBuffer as ArrayBuffer);
    const parentSheetNames = readParentWb.worksheets.map((ws) => ws.name);
    const expectedParentSheets = ['ملخص الحساب', 'الفروع', 'الحركات المجمعة', 'الأرصدة'];

    // Leaf account with zero movements should omit 'الفروع' and 'الحركات المجمعة'
    const leafWb = createSingleParentAccountWorkbook({
      accountId: 'zero',
      accounts: accs,
      transactions: txs,
      categories,
      currencySymbol: 'ر.س',
    });
    const leafSheetNames = leafWb.worksheets.map((ws) => ws.name);

    const parentHasAll = expectedParentSheets.every((s) => parentSheetNames.includes(s));
    const leafOmitsEmpty =
      leafSheetNames.includes('ملخص الحساب') &&
      leafSheetNames.includes('الأرصدة') &&
      !leafSheetNames.includes('الفروع') &&
      !leafSheetNames.includes('الحركات المجمعة');

    record(
      'HIER-09B',
      'Test 9B: Single-Parent Excel workbook & empty-sheet omission for leaf accounts',
      parentHasAll && leafOmitsEmpty,
      `parentSheets=[${parentSheetNames.join(', ')}], leafSheets=[${leafSheetNames.join(', ')}]`
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
