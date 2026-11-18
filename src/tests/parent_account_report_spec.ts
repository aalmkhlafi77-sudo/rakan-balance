/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Independent Parent Account & Branches Period Report Test Suite
 * Covers PARENT-01 through PARENT-12.
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import {
  generateParentAccountPeriodReport,
  getSelectableParentAccounts,
} from '../domain/hierarchical_accounts.ts';
import { createParentAccountPeriodWorkbook } from '../services/excel_export.ts';
import { buildParentAccountPeriodPdfConfig, getPdfReportHtml } from '../services/pdf_export.ts';

export interface ParentAccountReportSuiteResult {
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
  status: 'active' | 'archived' = 'active'
): AccountModel {
  return {
    id,
    name,
    parentId,
    categoryId,
    openingBalanceMinor,
    status,
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

export async function runParentAccountReportTestSuite(): Promise<ParentAccountReportSuiteResult> {
  const results: { id: string; name: string; passed: boolean; message: string }[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function record(id: string, name: string, passed: boolean, message: string) {
    if (passed) passedCount++;
    else failedCount++;
    results.push({ id, name, passed, message });
  }

  const categories: CategoryModel[] = [
    { id: 'cat_1', name: 'صناديق', sortOrder: 1 },
    { id: 'cat_2', name: 'فروع', sortOrder: 2 },
  ];

  // =========================================================================
  // PARENT-01: A -> [B, C, D] Exact Consolidated Match & Selector Filtering
  // =========================================================================
  {
    const accs = [
      makeAccount('A', 'صناديق الفروع', null, 0, 'cat_1'),
      makeAccount('B', 'صندوق الفيصلية', 'A', 100000, 'cat_1'), // 1,000
      makeAccount('C', 'صندوق فرع الرياض', 'A', 0, 'cat_1'),
      makeAccount('D', 'صندوق فرع تبوك', 'A', 50000, 'cat_1'), // 500
    ];
    const txs = [
      makeTx('t1', 'B', 'owedByAccount', 1500000, '2026-02-05', 'إيداع 1'), // +15,000
      makeTx('t2', 'B', 'owedToAccount', 50000, '2026-02-06', 'سحب 1'), // -500
      makeTx('t3', 'C', 'owedByAccount', 3000000, '2026-02-07', 'إيداع 2'), // +30,000
      makeTx('t4', 'C', 'owedToAccount', 700000, '2026-02-08', 'سحب 2'), // -7,000
      makeTx('t5', 'D', 'owedByAccount', 900000, '2026-02-09', 'إيداع 3'), // +9,000
    ];

    const selectables = getSelectableParentAccounts(accs, 'active');
    const summaryMode = generateParentAccountPeriodReport(accs, txs, categories, 'A', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'summary',
    });
    const detailMode = generateParentAccountPeriodReport(accs, txs, categories, 'A', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const sumBranchesOpen = detailMode.branchRows.reduce((s, r) => s + r.openingAtPeriodMinor, 0);
    const sumBranchesOwedBy = detailMode.branchRows.reduce((s, r) => s + r.owedByMinor, 0);
    const sumBranchesOwedTo = detailMode.branchRows.reduce((s, r) => s + r.owedToMinor, 0);
    const sumBranchesClose = detailMode.branchRows.reduce((s, r) => s + r.closingBalanceMinor, 0);

    const passed =
      selectables.length === 1 &&
      selectables[0].account.id === 'A' && // Leaf accounts B, C, D excluded
      summaryMode.allRows.length === 1 &&
      detailMode.allRows.length === 4 && // Summary row A + B + C + D
      detailMode.summary.openingAtPeriodMinor === 150000 &&
      detailMode.summary.owedByMinor === 5400000 &&
      detailMode.summary.owedToMinor === 750000 &&
      detailMode.summary.closingBalanceMinor === 4800000 &&
      sumBranchesOpen === detailMode.summary.openingAtPeriodMinor &&
      sumBranchesOwedBy === detailMode.summary.owedByMinor &&
      sumBranchesOwedTo === detailMode.summary.owedToMinor &&
      sumBranchesClose === detailMode.summary.closingBalanceMinor;

    record(
      'PARENT-01',
      'A -> B,C,D: تطابق مجموع الفروع مع صف A المجمع واستبعاد الحسابات الورقية من الاختيار',
      passed,
      `selectables=${selectables.length}, summaryRows=${summaryMode.allRows.length}, open=${detailMode.summary.openingAtPeriodMinor}, owedBy=${detailMode.summary.owedByMinor}, owedTo=${detailMode.summary.owedToMinor}, close=${detailMode.summary.closingBalanceMinor}`
    );
  }

  // =========================================================================
  // PARENT-02: Parent Direct = 0, Children > 0 -> Parent must appear
  // =========================================================================
  {
    const accs = [
      makeAccount('P0', 'رئيسي صفري مباشر', null, 0, 'cat_1'),
      makeAccount('C1', 'فرع نشط 1', 'P0', 4800000, 'cat_1'),
    ];
    const report = generateParentAccountPeriodReport(accs, [], categories, 'P0', { mode: 'detailed' });

    const passed =
      report.summaryRow !== null &&
      report.directRootRow === null &&
      report.allRows.length === 2 && // Summary row + C1
      report.summary.closingBalanceMinor === 4800000 &&
      report.summary.activeBranchesCount === 1;

    record(
      'PARENT-02',
      'Parent Direct = 0 وله فروع بأرصدة: ظهور الحساب الرئيسي بقيمة الفروع المجمعة',
      passed,
      `allRows=${report.allRows.length}, summaryClose=${report.summary.closingBalanceMinor}, directRow=${report.directRootRow}`
    );
  }

  // =========================================================================
  // PARENT-03: Parent with direct opening/transactions (counted ONCE, visibly separated)
  // =========================================================================
  {
    const accs = [
      makeAccount('P_DIR', 'صناديق الفروع', null, 100000, 'cat_1'), // +1,000 direct opening
      makeAccount('B_DIR', 'فرع الرياض', 'P_DIR', 4800000, 'cat_1'), // +48,000
    ];
    const txs = [
      makeTx('td1', 'P_DIR', 'owedByAccount', 300000, '2026-02-10', 'حركة مباشرة على الرئيسي'), // +3,000
    ];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'P_DIR', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const detailSumClose = report.detailRows.reduce((s, r) => s + r.closingBalanceMinor, 0);
    const passed =
      report.summary.hasDirectRootActivity === true &&
      report.directRootRow !== null &&
      report.directRootRow.closingBalanceMinor === 400000 && // 1,000 + 3,000 = 4,000
      report.summary.closingBalanceMinor === 5200000 && // 4,000 + 48,000 = 52,000 (counted ONCE!)
      detailSumClose === report.summary.closingBalanceMinor;

    record(
      'PARENT-03',
      'حركات وافتتاحي مباشر على الحساب الرئيسي: إظهارها بصف مستقل وحسابها مرة واحدة فقط',
      passed,
      `directClose=${report.directRootRow?.closingBalanceMinor}, totalClose=${report.summary.closingBalanceMinor}, detailSum=${detailSumClose}`
    );
  }

  // =========================================================================
  // PARENT-04: 3+ Levels Deep (A -> B -> C -> D)
  // =========================================================================
  {
    const accs = [
      makeAccount('L0', 'الشجرة', null, 0, 'cat_1'),
      makeAccount('L1', 'منطقة الوسطى', 'L0', 10000, 'cat_1'),
      makeAccount('L2', 'قطاع الرياض', 'L1', 20000, 'cat_2'),
      makeAccount('L3', 'فرع العليا', 'L2', 30000, 'cat_2'),
    ];
    const report = generateParentAccountPeriodReport(accs, [], categories, 'L0', { mode: 'detailed' });

    const r1 = report.branchRows.find((r) => r.account.id === 'L1');
    const r2 = report.branchRows.find((r) => r.account.id === 'L2');
    const r3 = report.branchRows.find((r) => r.account.id === 'L3');

    const passed =
      report.branchRows.length === 3 &&
      r1?.level === 1 &&
      r2?.level === 2 &&
      r3?.level === 3 &&
      report.summary.closingBalanceMinor === 60000 &&
      report.summary.activeBranchesCount === 3;

    record(
      'PARENT-04',
      'دعم 3+ مستويات (A -> B -> C -> D): احتساب الأحفاد وتدرج المستويات بدقة',
      passed,
      `levels=[${r1?.level},${r2?.level},${r3?.level}], total=${report.summary.closingBalanceMinor}`
    );
  }

  // =========================================================================
  // PARENT-05: Zero Dormant Child excluded & doesn't affect totals
  // =========================================================================
  {
    const accs = [
      makeAccount('Z_ROOT', 'رئيسي', null, 0, 'cat_1'),
      makeAccount('Z_ACTIVE', 'فرع فعال', 'Z_ROOT', 25000, 'cat_1'),
      makeAccount('Z_DORMANT', 'فرع صفري خامل', 'Z_ROOT', 0, 'cat_1'),
    ];
    const report = generateParentAccountPeriodReport(accs, [], categories, 'Z_ROOT', { mode: 'detailed' });

    const passed =
      report.branchRows.length === 1 &&
      report.branchRows[0].account.id === 'Z_ACTIVE' &&
      report.excludedDormantCount === 1 &&
      report.summary.closingBalanceMinor === 25000;

    record(
      'PARENT-05',
      'Zero Dormant Child: استبعاد الفرع الصفري الخامل من العرض والحسابات',
      passed,
      `branches=${report.branchRows.length}, excluded=${report.excludedDormantCount}, close=${report.summary.closingBalanceMinor}`
    );
  }

  // =========================================================================
  // PARENT-06: Settled Child (حركة > 0, Closing = 0 -> MUST appear as 'تمت التسوية')
  // =========================================================================
  {
    const accs = [
      makeAccount('S_ROOT', 'رئيسي تسويات', null, 0, 'cat_1'),
      makeAccount('S_CHILD', 'فرع مسوى', 'S_ROOT', 10000, 'cat_1'),
    ];
    const txs = [makeTx('ts_settle', 'S_CHILD', 'owedToAccount', 10000, '2026-02-12', 'تسوية كاملة')];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'S_ROOT', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const childRow = report.branchRows.find((r) => r.account.id === 'S_CHILD');
    const passed =
      report.branchRows.length === 1 &&
      childRow?.closingBalanceMinor === 0 &&
      childRow?.periodTransactionCount === 1 &&
      childRow?.balanceType === 'settled' &&
      childRow?.balanceTypeLabel === 'تمت التسوية' &&
      report.summary.balanceTypeLabel === 'تمت التسوية';

    record(
      'PARENT-06',
      'Settled Child: ظهور الفرع الذي تحرك وأغلق صفراً بتسمية «تمت التسوية»',
      passed,
      `label=${childRow?.balanceTypeLabel}, close=${childRow?.closingBalanceMinor}, txCount=${childRow?.periodTransactionCount}`
    );
  }

  // =========================================================================
  // PARENT-07: Period Opening (pre-fromDate transactions added into Opening)
  // =========================================================================
  {
    const accs = [
      makeAccount('PO_ROOT', 'رئيسي فترات', null, 0, 'cat_1'),
      makeAccount('PO_CHILD', 'فرع فترات', 'PO_ROOT', 50000, 'cat_1'), // 500 orig open
    ];
    const txs = [
      makeTx('po1', 'PO_CHILD', 'owedByAccount', 30000, '2026-01-15', 'قبل الفترة'), // +300 pre -> Open=800
      makeTx('po2', 'PO_CHILD', 'owedByAccount', 20000, '2026-02-10', 'داخل الفترة'), // +200 in
      makeTx('po3', 'PO_CHILD', 'owedByAccount', 99000, '2026-03-05', 'بعد الفترة'), // ignored
    ];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'PO_ROOT', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const childRow = report.branchRows[0];
    const passed =
      childRow?.openingAtPeriodMinor === 80000 &&
      childRow?.owedByMinor === 20000 &&
      childRow?.closingBalanceMinor === 100000 &&
      report.summary.openingAtPeriodMinor === 80000 &&
      report.summary.closingBalanceMinor === 100000 &&
      report.movements.length === 1;

    record(
      'PARENT-07',
      'Period Opening: دمج حركات ما قبل البداية في رصيد أول الفترة واستبعاد ما بعد النهاية',
      passed,
      `open=${childRow?.openingAtPeriodMinor}, inOwedBy=${childRow?.owedByMinor}, close=${childRow?.closingBalanceMinor}, mov=${report.movements.length}`
    );
  }

  // =========================================================================
  // PARENT-08: All Periods (opening === openingBalanceMinor, full history)
  // =========================================================================
  {
    const accs = [
      makeAccount('AP_ROOT', 'رئيسي كل الفترات', null, 10000, 'cat_1'),
      makeAccount('AP_CHILD', 'فرع كل الفترات', 'AP_ROOT', 20000, 'cat_1'),
    ];
    const txs = [
      makeTx('ap1', 'AP_CHILD', 'owedByAccount', 5000, '2025-12-01', 'حركة قديمة'),
      makeTx('ap2', 'AP_CHILD', 'owedToAccount', 3000, '2026-06-15', 'حركة حديثة'),
    ];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'AP_ROOT', {
      mode: 'detailed',
    });

    const passed =
      report.summary.openingAtPeriodMinor === 30000 && // 10000 + 20000 exact original opening
      report.summary.owedByMinor === 5000 &&
      report.summary.owedToMinor === 3000 &&
      report.summary.closingBalanceMinor === 32000 &&
      report.movements.length === 2;

    record(
      'PARENT-08',
      'All Periods: تساوي رصيد أول الفترة مع الرصيد الافتتاحي الأصلي وشمول كامل التاريخ',
      passed,
      `open=${report.summary.openingAtPeriodMinor}, close=${report.summary.closingBalanceMinor}, mov=${report.movements.length}`
    );
  }

  // =========================================================================
  // PARENT-09: Equation (Opening + OwedBy - OwedTo === Closing) for parent & all rows
  // =========================================================================
  {
    const accs = [
      makeAccount('EQ_ROOT', 'رئيسي معادلة', null, 25000, 'cat_1'),
      makeAccount('EQ_C1', 'فرع 1', 'EQ_ROOT', 10000, 'cat_1'),
      makeAccount('EQ_C2', 'فرع 2', 'EQ_C1', -40000, 'cat_2'),
    ];
    const txs = [
      makeTx('eq1', 'EQ_ROOT', 'owedByAccount', 12000, '2026-02-05', 'مباشر'),
      makeTx('eq2', 'EQ_C1', 'owedToAccount', 5000, '2026-02-06', 'فرع 1'),
      makeTx('eq3', 'EQ_C2', 'owedByAccount', 15000, '2026-02-07', 'فرع 2'),
    ];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'EQ_ROOT', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const allRowsSatisfyEq = report.allRows.every(
      (r) =>
        r.netMovementMinor === r.owedByMinor - r.owedToMinor &&
        r.openingAtPeriodMinor + r.owedByMinor - r.owedToMinor === r.closingBalanceMinor
    );
    const summaryEq =
      report.summary.openingAtPeriodMinor +
        report.summary.owedByMinor -
        report.summary.owedToMinor ===
      report.summary.closingBalanceMinor;

    record(
      'PARENT-09',
      'Equation (Opening + OwedBy - OwedTo = Closing) محققة للملخص وكل صف فرعي',
      allRowsSatisfyEq && summaryEq,
      `allRowsEq=${allRowsSatisfyEq}, summaryEq=${summaryEq}`
    );
  }

  // =========================================================================
  // PARENT-10: Strict Zero Double Counting across intermediate sub-parents
  // =========================================================================
  {
    const accs = [
      makeAccount('DC_ROOT', 'المجموعة الرئيسية', null, 10000, 'cat_1'),
      makeAccount('DC_MID', 'أب وسيط', 'DC_ROOT', 20000, 'cat_1'),
      makeAccount('DC_LEAF1', 'ابن 1', 'DC_MID', 30000, 'cat_1'),
      makeAccount('DC_LEAF2', 'ابن 2', 'DC_MID', 40000, 'cat_1'),
    ];
    const report = generateParentAccountPeriodReport(accs, [], categories, 'DC_ROOT', {
      mode: 'detailed',
    });

    // True total MUST be 10000 + 20000 + 30000 + 40000 = 100000 (NOT inflating DC_MID with its children!)
    const detailRowsSum = report.detailRows.reduce((s, r) => s + r.closingBalanceMinor, 0);
    const passed =
      report.summary.closingBalanceMinor === 100000 &&
      detailRowsSum === 100000 &&
      report.detailRows.length === 4; // directRootRow (10000) + DC_MID (20000) + DC_LEAF1 (30000) + DC_LEAF2 (40000)

    record(
      'PARENT-10',
      'No Double Counting: عدم مضاعفة أرصدة الآباء الوسطيين مع الفروع في الإجمالي',
      passed,
      `summaryClose=${report.summary.closingBalanceMinor} (exp 100000), detailSum=${detailRowsSum}`
    );
  }

  // =========================================================================
  // PARENT-11: Excel totals === Screen totals + 3 exact sheets + XSS safe
  // =========================================================================
  {
    const accs = [
      makeAccount('EX_R', 'صناديق رئيسية', null, 5000, 'cat_1'),
      makeAccount('EX_C1', '=HYPERLINK("bad") الفرع الأول', 'EX_R', 20000, 'cat_1'),
      makeAccount('EX_C2', 'الفرع الثاني', 'EX_R', 30000, 'cat_2'),
    ];
    const txs = [
      makeTx('ext1', 'EX_C1', 'owedByAccount', 10000, '2026-02-10', 'حركة 1'),
      makeTx('ext2', 'EX_C2', 'owedToAccount', 5000, '2026-02-15', 'حركة 2'),
    ];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'EX_R', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const wb = createParentAccountPeriodWorkbook(report, 'ر.س', { ownerName: 'راكان' });
    const buf = await wb.xlsx.writeBuffer();
    const readWb = new ExcelJS.Workbook();
    await readWb.xlsx.load(buf as ArrayBuffer);

    const sheetNames = readWb.worksheets.map((w) => w.name);
    const branchWs = readWb.getWorksheet('أرصدة الفروع')!;
    const movWs = readWb.getWorksheet('الحركات')!;
    const totalsRow = branchWs.getRow(branchWs.rowCount);
    const excelClosing = Math.round(Number(totalsRow.getCell(8).value) * 100);
    const excelOpening = Math.round(Number(totalsRow.getCell(4).value) * 100);
    const movLastRow = movWs.getRow(movWs.rowCount);
    const excelMovClosing = Math.round(Number(movLastRow.getCell(8).value) * 100);

    // Formula injection safety check on branchWs
    let formulaSafe = true;
    branchWs.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
          formulaSafe = false;
        }
      });
    });

    const passed =
      sheetNames.length === 3 &&
      sheetNames[0] === 'ملخص الحساب الرئيسي' &&
      sheetNames[1] === 'أرصدة الفروع' &&
      sheetNames[2] === 'الحركات' &&
      excelOpening === report.summary.openingAtPeriodMinor &&
      excelClosing === report.summary.closingBalanceMinor &&
      excelMovClosing === report.summary.closingBalanceMinor &&
      branchWs.views?.[0]?.rightToLeft === true &&
      formulaSafe;

    record(
      'PARENT-11',
      'Excel Totals === Screen Totals: تطابق الشيتات الثلاث والأرقام والتنسيق والحماية',
      passed,
      `sheets=[${sheetNames.join(', ')}], excelClose=${excelClosing}/${report.summary.closingBalanceMinor}, formulaSafe=${formulaSafe}`
    );
  }

  // =========================================================================
  // PARENT-12: PDF totals === Screen totals & XSS safe
  // =========================================================================
  {
    const accs = [
      makeAccount('PD_R', 'حساب <script>alert(1)</script> رئيسي', null, 15000, 'cat_1'),
      makeAccount('PD_C', 'فرع نشط', 'PD_R', 25000, 'cat_1'),
    ];
    const txs = [makeTx('pdt1', 'PD_C', 'owedByAccount', 10000, '2026-02-10', 'قيد')];
    const report = generateParentAccountPeriodReport(accs, txs, categories, 'PD_R', {
      fromDate: '2026-02-01',
      toDate: '2026-02-28',
      mode: 'detailed',
    });

    const pdfConfig = buildParentAccountPeriodPdfConfig(report, {
      ownerName: 'راكان',
      currencySymbol: 'ر.س',
    });
    const html = getPdfReportHtml(pdfConfig);

    const passed =
      pdfConfig.rows.length === report.allRows.length &&
      pdfConfig.columns.length === 9 &&
      pdfConfig.metrics?.length === 4 &&
      pdfConfig.metrics[3].value.includes('500') && // 15000 + 25000 + 10000 = 50000 halalas = 500.00
      !html.includes('<script>alert(1)</script>') &&
      html.includes('&lt;script&gt;alert(1)&lt;/script&gt;');

    record(
      'PARENT-12',
      'PDF Totals === Screen Totals: تطابق صفوف وإجماليات PDF مع النموذج وحماية HTML',
      passed,
      `pdfRows=${pdfConfig.rows.length}/${report.allRows.length}, closingMetric=${pdfConfig.metrics?.[3]?.value}`
    );
  }

  return { passedCount, failedCount, results };
}
