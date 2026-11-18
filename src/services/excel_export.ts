/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Professional Multi-Sheet Excel Export Service (.xlsx)
 * Uses security-patched @andreeewill/exceljs to generate formula-injection-safe,
 * styled, RTL-oriented workbooks with Freeze Panes, AutoFilter, and numeric formatting.
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import { compareTransactions, getSignedTransactionMinor } from '../domain/balance_calculator.ts';
import {
  AccountBalanceReportRow,
  CategorySummaryReportRow,
  PartyRow,
  PeriodTransactionRow,
  ReportFilterOptions,
} from '../domain/financial_reports.ts';
import {
  calculateConsolidatedStatement,
  createHierarchyIndex,
  generateHierarchicalAccountsReport,
  HierarchicalAccountsReport,
} from '../domain/hierarchical_accounts.ts';

/**
 * Sanitizes cell text to prevent Excel Formula Injection (=, +, -, @, \t, \r)
 */
export function sanitizeCellString(val: unknown): string | number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function getDisplayWidth(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 2;
  }
  const s = String(value);
  // Arabic characters often render slightly wider in Excel default fonts
  const hasArabic = /[\u0600-\u06FF]/.test(s);
  return Math.ceil(s.length * (hasArabic ? 1.25 : 1.05));
}

const THIN_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFCBD5E1' },
};

const MEDIUM_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'medium',
  color: { argb: 'FF475569' },
};

const DOUBLE_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'double',
  color: { argb: 'FF0F766E' },
};

const COLORS = {
  titleFill: 'FF0F172A',
  titleText: 'FFFFFFFF',
  metaFill: 'FFF1F5F9',
  metaText: 'FF334155',
  headerFill: 'FF0F766E',
  headerText: 'FFFFFFFF',
  zebraFill: 'FFF8FAFC',
  whiteFill: 'FFFFFFFF',
  parentFill: 'FFECFDF5',
  totalFill: 'FFE2E8F0',
  positiveText: 'FF047857',
  negativeText: 'FFBE123C',
  neutralText: 'FF64748B',
  darkText: 'FF0F172A',
};

function applyBannerAndMeta(
  worksheet: ExcelJS.Worksheet,
  colCount: number,
  title: string,
  metaLine: string
): void {
  const safeColCount = Math.max(colCount, 2);

  // Row 1: Title Banner
  worksheet.mergeCells(1, 1, 1, safeColCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = sanitizeCellString(title);
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: COLORS.titleText } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleFill } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  // Row 2: Metadata Subtitle Banner
  worksheet.mergeCells(2, 1, 2, safeColCount);
  const metaCell = worksheet.getCell(2, 1);
  metaCell.value = sanitizeCellString(metaLine);
  metaCell.font = { name: 'Arial', size: 10, bold: false, color: { argb: COLORS.metaText } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.metaFill } };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getRow(2).height = 22;

  // Row 3: Clean Spacer
  worksheet.getRow(3).height = 8;
}

function styleTableHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 26;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: MEDIUM_BORDER_SIDE,
      left: THIN_BORDER_SIDE,
      right: THIN_BORDER_SIDE,
      bottom: MEDIUM_BORDER_SIDE,
    };
  }
}

interface TableColumnSpec {
  header: string;
  align?: 'right' | 'center' | 'left';
  type?: 'text' | 'currency' | 'integer' | 'percent' | 'date';
  semanticColor?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

function finalizeSheetLayout(
  worksheet: ExcelJS.Worksheet,
  headerRowNum: number,
  lastFilterRowNum: number,
  columns: TableColumnSpec[]
): void {
  const colCount = columns.length;

  worksheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: headerRowNum }];

  if (lastFilterRowNum >= headerRowNum) {
    worksheet.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: lastFilterRowNum, column: colCount },
    };
  }

  for (let c = 1; c <= colCount; c++) {
    const spec = columns[c - 1];
    let maxLen = getDisplayWidth(spec.header) + 4;
    const col = worksheet.getColumn(c);

    // Measure rows starting from headerRowNum (skipping merged rows 1-2)
    for (let r = headerRowNum; r <= worksheet.rowCount; r++) {
      const val = worksheet.getRow(r).getCell(c).value;
      const w = getDisplayWidth(val);
      if (w > maxLen) maxLen = w;
    }

    const minW = spec.minWidth ?? 12;
    const maxW = spec.maxWidth ?? 48;
    col.width = Math.min(Math.max(maxLen + 3, minW), maxW);
  }
}

function styleDataCell(
  cell: ExcelJS.Cell,
  spec: TableColumnSpec,
  rowIndexFromZero: number,
  options?: { isParent?: boolean; isTotal?: boolean; indent?: number }
): void {
  const isParent = Boolean(options?.isParent);
  const isTotal = Boolean(options?.isTotal);

  const bgColor = isTotal
    ? COLORS.totalFill
    : isParent
    ? COLORS.parentFill
    : rowIndexFromZero % 2 === 1
    ? COLORS.zebraFill
    : COLORS.whiteFill;

  let textColor = COLORS.darkText;
  if (spec.semanticColor && typeof cell.value === 'number') {
    if (cell.value > 0) textColor = COLORS.positiveText;
    else if (cell.value < 0) textColor = COLORS.negativeText;
    else textColor = COLORS.neutralText;
  }

  cell.font = {
    name: 'Arial',
    size: isTotal ? 11 : 10,
    bold: isParent || isTotal,
    color: { argb: textColor },
  };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

  const horizontal =
    spec.align ?? (spec.type === 'currency' || spec.type === 'integer' || spec.type === 'percent' ? 'left' : 'right');

  cell.alignment = {
    horizontal,
    vertical: 'middle',
    indent: options?.indent && options.indent > 0 ? Math.min(options.indent, 12) : undefined,
  };

  if (spec.type === 'currency') {
    cell.numFmt = '#,##0.00';
  } else if (spec.type === 'integer') {
    cell.numFmt = '0';
  } else if (spec.type === 'percent') {
    cell.numFmt = '0.00"%"';
  }

  cell.border = {
    top: isTotal || isParent ? MEDIUM_BORDER_SIDE : THIN_BORDER_SIDE,
    bottom: isTotal ? DOUBLE_BORDER_SIDE : THIN_BORDER_SIDE,
    left: THIN_BORDER_SIDE,
    right: THIN_BORDER_SIDE,
  };
}

function createStyledTableSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  metaLine: string,
  columns: TableColumnSpec[],
  rows: Array<{
    values: (string | number)[];
    isParent?: boolean;
    indentCol0?: number;
  }>,
  totalsRow?: (string | number)[]
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(sheetName);
  const colCount = columns.length;

  applyBannerAndMeta(worksheet, colCount, title, metaLine);

  const headerRowNum = 4;
  const headerRow = worksheet.getRow(headerRowNum);
  headerRow.values = columns.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(headerRow, colCount);

  let currentRowNum = headerRowNum;

  rows.forEach((rowSpec, idx) => {
    currentRowNum++;
    const row = worksheet.getRow(currentRowNum);
    row.height = rowSpec.isParent ? 23 : 20;
    row.values = rowSpec.values.map((v) => sanitizeCellString(v));
    for (let c = 1; c <= colCount; c++) {
      styleDataCell(row.getCell(c), columns[c - 1], idx, {
        isParent: rowSpec.isParent,
        indent: c === 1 ? rowSpec.indentCol0 : undefined,
      });
    }
  });

  const lastFilterRowNum = currentRowNum;

  if (totalsRow) {
    currentRowNum++;
    const tRow = worksheet.getRow(currentRowNum);
    tRow.height = 24;
    tRow.values = totalsRow.map((v) => sanitizeCellString(v));
    for (let c = 1; c <= colCount; c++) {
      styleDataCell(tRow.getCell(c), columns[c - 1], 0, { isTotal: true });
    }
  }

  finalizeSheetLayout(worksheet, headerRowNum, lastFilterRowNum, columns);
  return worksheet;
}

/**
 * Browser download helper for generated ExcelJS workbooks.
 */
async function downloadWorkbook(workbook: ExcelJS.Workbook, baseFilename: string): Promise<void> {
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanName = baseFilename.replace(/[^\w\u0600-\u06FF\s-]/g, '_');
  const filename = `${cleanName}_${dateStr}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ComprehensiveExcelParams {
  accounts: AccountModel[];
  transactions: TransactionModel[];
  categories: CategoryModel[];
  currencySymbol: string;
  currencyName?: string;
  ownerName?: string;
  filterOptions?: ReportFilterOptions;
  reportTitle?: string;
}

function getBalanceTypeLabel(type: 'receivable' | 'payable' | 'balanced'): string {
  if (type === 'receivable') return 'لك (مستحق لك)';
  if (type === 'payable') return 'عليك (التزام عليك)';
  return 'متزن';
}

/**
 * Builds the 6-sheet Comprehensive Financial & Hierarchical Workbook (ExcelJS):
 * 1. الملخص العام
 * 2. الأرصدة التفصيلية
 * 3. الشجرة المالية
 * 4. التحليل المالي
 * 5. ملخص الحسابات الرئيسية
 * 6. الحركات (created only when movements exist)
 */
export function createComprehensiveAccountsWorkbook(
  params: ComprehensiveExcelParams
): ExcelJS.Workbook {
  const {
    accounts,
    transactions,
    categories,
    currencySymbol,
    currencyName,
    ownerName = 'المالك',
    filterOptions = {},
    reportTitle = 'التقرير المالي الشامل والشجرة المحاسبية',
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RAKAN BALANCE';
  workbook.created = new Date();

  const report: HierarchicalAccountsReport = generateHierarchicalAccountsReport(
    accounts,
    transactions,
    categories,
    filterOptions
  );

  const exportDateStr = new Date().toISOString().slice(0, 10);
  const periodLabel =
    filterOptions.fromDate || filterOptions.toDate
      ? `من ${filterOptions.fromDate || 'البداية'} إلى ${filterOptions.toDate || 'اليوم'}`
      : 'جميع الفترات';
  const currencyLabel = currencyName ? `${currencyName} (${currencySymbol})` : currencySymbol;
  const metaLine = `المالك: ${ownerName}  |  العملة: ${currencyLabel}  |  الفترة: ${periodLabel}  |  تاريخ التصدير: ${exportDateStr}`;

  // Collect matching period movements for included accounts
  const includedAccountIds = new Set(report.rows.map((r) => r.account.id));
  const hierarchyIndex = createHierarchyIndex(accounts, transactions, filterOptions.toDate);

  const filteredMovements = transactions
    .filter((t) => {
      if (!includedAccountIds.has(t.accountId)) return false;
      if (filterOptions.fromDate && t.date < filterOptions.fromDate) return false;
      if (filterOptions.toDate && t.date > filterOptions.toDate) return false;
      return true;
    })
    .sort(compareTransactions);

  let periodOwedByMinor = 0;
  let periodOwedToMinor = 0;
  for (const t of filteredMovements) {
    if (t.entryType === 'owedByAccount') periodOwedByMinor += t.amountMinor;
    else periodOwedToMinor += t.amountMinor;
  }

  // =========================================================================
  // SHEET 1: الملخص العام (Executive Summary KPIs)
  // =========================================================================
  const kpiColumns: TableColumnSpec[] = [
    { header: 'المؤشر / البيان الإداري', align: 'right', type: 'text', minWidth: 28 },
    { header: 'القيمة', align: 'left', type: 'currency', semanticColor: true, minWidth: 20 },
    { header: 'الوحدة / التصنيف', align: 'center', type: 'text', minWidth: 16 },
    { header: 'توضيح تحليلي', align: 'right', type: 'text', minWidth: 36 },
  ];

  const kpiSheet = workbook.addWorksheet('الملخص العام');
  applyBannerAndMeta(kpiSheet, 4, `RAKAN BALANCE — ${reportTitle}`, metaLine);
  const kpiHeader = kpiSheet.getRow(4);
  kpiHeader.values = kpiColumns.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(kpiHeader, 4);

  const kpiRows: Array<{ label: string; value: string | number; unit: string; note: string; type: TableColumnSpec['type']; semantic?: boolean }> = [
    { label: 'اسم النظام', value: 'RAKAN BALANCE (راكان بلانس)', unit: 'منصة مالية', note: 'نظام محاسبي هرمي دقيق', type: 'text' },
    { label: 'اسم التقرير', value: reportTitle, unit: 'تقرير متعدد الصفحات', note: 'يعرض الأرصدة المباشرة والمجمعة دون تكرار', type: 'text' },
    { label: 'اسم المالك', value: ownerName, unit: 'الحساب الشخصي', note: 'مالك الدفتر المالي', type: 'text' },
    { label: 'العملة المحلية', value: currencyLabel, unit: currencySymbol, note: 'جميع الأرصدة بالعملة الموحدة', type: 'text' },
    { label: 'الفترة الزمنية المحددة', value: periodLabel, unit: 'نطاق التاريخ', note: filterOptions.toDate ? `الرصيد التاريخي محسوب حتى ${filterOptions.toDate}` : 'شامل جميع الحركات', type: 'text' },
    { label: 'تاريخ التصدير', value: exportDateStr, unit: 'YYYY-MM-DD', note: 'تاريخ إنشاء ملف Excel', type: 'text' },
    { label: 'إجمالي الحسابات بالتقرير', value: report.totalAccountsCount, unit: 'حساب', note: 'مجموع الحسابات المطابقة للفلتر', type: 'integer' },
    { label: 'عدد الحسابات الرئيسية (الجذور)', value: report.rootAccountsCount, unit: 'حساب رئيسي', note: 'حسابات المستوى الأول بدون أب', type: 'integer' },
    { label: 'عدد الحسابات التابعة / الفرعية', value: report.branchAccountsCount, unit: 'حساب فرعي', note: 'حسابات مرتبطة بحساب أب', type: 'integer' },
    { label: 'عدد الحسابات الأبوية ذات الفروع', value: report.parentAccountsCount, unit: 'حساب أب', note: 'حسابات لها رصيد مجمع من توابعها', type: 'integer' },
    { label: 'عدد الحركات المشمولة في الفترة', value: filteredMovements.length, unit: 'حركة', note: 'عدد قيود الفترة المحددة', type: 'integer' },
    { label: 'إجمالي لك (حقوقك المباشرة)', value: report.totalDirectReceivableMinor / 100, unit: currencySymbol, note: 'مجموع الأرصدة المباشرة الموجبة بدون تكرار', type: 'currency', semantic: true },
    { label: 'إجمالي عليك (التزاماتك المباشرة)', value: report.totalDirectPayableMinor / 100, unit: currencySymbol, note: 'مجموع الأرصدة المباشرة السالبة بدون تكرار', type: 'currency' },
    { label: 'صافي المركز المالي المباشر', value: report.netDirectBalanceMinor / 100, unit: currencySymbol, note: 'الفرق الصافي: (إجمالي لك - إجمالي عليك)', type: 'currency', semantic: true },
    { label: 'إجمالي عليه خلال الفترة', value: periodOwedByMinor / 100, unit: currencySymbol, note: 'مجموع الحركات المدينة خلال الفترة', type: 'currency', semantic: true },
    { label: 'إجمالي له خلال الفترة', value: periodOwedToMinor / 100, unit: currencySymbol, note: 'مجموع الحركات الدائنة خلال الفترة', type: 'currency' },
  ];

  kpiRows.forEach((item, idx) => {
    const rNum = 5 + idx;
    const row = kpiSheet.getRow(rNum);
    row.height = 21;
    row.values = [
      sanitizeCellString(item.label),
      sanitizeCellString(item.value),
      sanitizeCellString(item.unit),
      sanitizeCellString(item.note),
    ];
    for (let c = 1; c <= 4; c++) {
      const colSpec: TableColumnSpec =
        c === 2
          ? { header: 'القيمة', align: typeof item.value === 'number' ? 'left' : 'right', type: item.type, semanticColor: item.semantic }
          : kpiColumns[c - 1];
      styleDataCell(row.getCell(c), colSpec, idx);
    }
  });
  finalizeSheetLayout(kpiSheet, 4, 4 + kpiRows.length, kpiColumns);

  // =========================================================================
  // SHEET 2: الأرصدة التفصيلية (Detailed Direct Balances — No Double Counting)
  // =========================================================================
  const detailedColumns: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 22 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'الأب', align: 'right', type: 'text', minWidth: 18 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: `الرصيد الافتتاحي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
    { header: `إجمالي عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `إجمالي له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: 'نوع الرصيد', align: 'center', type: 'text', minWidth: 16 },
    { header: 'الحالة', align: 'center', type: 'text', minWidth: 12 },
  ];

  let sumOpening = 0;
  let sumOwedBy = 0;
  let sumOwedTo = 0;
  let sumDirect = 0;

  const detailedRows = report.rows.map((r) => {
    sumOpening += r.directOpeningMinor;
    sumOwedBy += r.directOwedByMinor;
    sumOwedTo += r.directOwedToMinor;
    sumDirect += r.directBalanceMinor;
    return {
      values: [
        r.account.name,
        r.categoryName,
        r.parentName || '— (رئيسي)',
        r.level,
        r.directOpeningMinor / 100,
        r.directOwedByMinor / 100,
        r.directOwedToMinor / 100,
        r.directBalanceMinor / 100,
        getBalanceTypeLabel(r.directBalanceType),
        r.account.status === 'active' ? 'نشط' : 'مؤرشف',
      ],
    };
  });

  if (detailedRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'الأرصدة التفصيلية',
      `الأرصدة التفصيلية المباشرة (${currencySymbol})`,
      metaLine,
      detailedColumns,
      detailedRows,
      [
        'الإجمالي العام (مباشر بدون تكرار)',
        `${report.rows.length} حساب`,
        '',
        '',
        sumOpening / 100,
        sumOwedBy / 100,
        sumOwedTo / 100,
        sumDirect / 100,
        sumDirect > 0 ? 'صافي لك' : sumDirect < 0 ? 'صافي عليك' : 'متزن',
        '',
      ]
    );
  }

  // =========================================================================
  // SHEET 3: الشجرة المالية (Hierarchical Tree with Real Indent & Consolidated)
  // =========================================================================
  const treeColumns: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 28 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: 'الأب', align: 'right', type: 'text', minWidth: 18 },
    { header: 'عدد الأبناء', align: 'center', type: 'integer', minWidth: 12 },
    { header: 'عدد التابعين', align: 'center', type: 'integer', minWidth: 12 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'نوع الرصيد المجمع', align: 'center', type: 'text', minWidth: 18 },
  ];

  const treeRows = report.rows.map((r) => ({
    values: [
      r.account.name,
      r.level,
      r.parentName || '— (جذر)',
      r.directChildrenCount,
      r.descendantCount,
      r.directBalanceMinor / 100,
      r.consolidatedBalanceMinor / 100,
      getBalanceTypeLabel(r.consolidatedBalanceType),
    ],
    isParent: r.isParent,
    indentCol0: r.level * 2,
  }));

  if (treeRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'الشجرة المالية',
      'الشجرة المالية (الأرصدة المباشرة والمجمعة)',
      metaLine,
      treeColumns,
      treeRows
    );
  }

  // =========================================================================
  // SHEET 4: التحليل المالي (Financial Analytics & Concentration)
  // =========================================================================
  const analysisColumns: TableColumnSpec[] = [
    { header: 'القسم التحليلي', align: 'right', type: 'text', minWidth: 24 },
    { header: 'الحساب / المؤشر', align: 'right', type: 'text', minWidth: 24 },
    { header: 'التصنيف / البيان', align: 'right', type: 'text', minWidth: 22 },
    { header: `القيمة / الرصيد (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'النسبة (%) / الملاحظة', align: 'center', type: 'text', minWidth: 20 },
  ];

  const positiveRows = report.rows.filter((r) => r.directBalanceMinor > 0).sort((a, b) => b.directBalanceMinor - a.directBalanceMinor);
  const negativeRows = report.rows.filter((r) => r.directBalanceMinor < 0).sort((a, b) => a.directBalanceMinor - b.directBalanceMinor);
  const balancedRows = report.rows.filter((r) => r.directBalanceMinor === 0);
  const zeroMovementRows = report.rows.filter((r) => r.directOwedByMinor === 0 && r.directOwedToMinor === 0);
  const largestRows = [...report.rows]
    .filter((r) => r.directBalanceMinor !== 0)
    .sort((a, b) => Math.abs(b.directBalanceMinor) - Math.abs(a.directBalanceMinor))
    .slice(0, 10);
  const topRootRows = report.rows
    .filter((r) => !r.account.parentId)
    .sort((a, b) => Math.abs(b.consolidatedBalanceMinor) - Math.abs(a.consolidatedBalanceMinor))
    .slice(0, 10);

  const analysisRows: Array<{ values: (string | number)[]; isParent?: boolean }> = [
    {
      values: ['ملخص التوزيع', 'الحسابات الموجبة (لك)', 'أطراف مستحق لك لديهم', positiveRows.length, `${report.rows.length ? ((positiveRows.length / report.rows.length) * 100).toFixed(1) : '0.0'}% من الحسابات`],
      isParent: true,
    },
    {
      values: ['ملخص التوزيع', 'الحسابات السالبة (عليك)', 'أطراف لهم التزام عليك', negativeRows.length, `${report.rows.length ? ((negativeRows.length / report.rows.length) * 100).toFixed(1) : '0.0'}% من الحسابات`],
      isParent: true,
    },
    {
      values: ['ملخص التوزيع', 'الحسابات المتزنة (صفر)', 'رصيدها الحالي متعادل', balancedRows.length, `${report.rows.length ? ((balancedRows.length / report.rows.length) * 100).toFixed(1) : '0.0'}% من الحسابات`],
    },
    {
      values: ['ملخص التوزيع', 'حسابات بدون حركة في الفترة', 'لم تسجل عليها حركات في النطاق', zeroMovementRows.length, periodLabel],
    },
  ];

  // Top 10 Debtors (لك)
  positiveRows.slice(0, 10).forEach((r, idx) => {
    const share = report.totalDirectReceivableMinor > 0 ? (r.directBalanceMinor / report.totalDirectReceivableMinor) * 100 : 0;
    analysisRows.push({
      values: [
        'أعلى 10 حسابات لك (مدينون)',
        `${idx + 1}. ${r.account.name}`,
        r.categoryName,
        r.directBalanceMinor / 100,
        `${share.toFixed(2)}% تركز`,
      ],
    });
  });

  // Top 10 Creditors (عليك)
  negativeRows.slice(0, 10).forEach((r, idx) => {
    const absBal = Math.abs(r.directBalanceMinor);
    const share = report.totalDirectPayableMinor > 0 ? (absBal / report.totalDirectPayableMinor) * 100 : 0;
    analysisRows.push({
      values: [
        'أعلى 10 حسابات عليك (دائنون)',
        `${idx + 1}. ${r.account.name}`,
        r.categoryName,
        r.directBalanceMinor / 100,
        `${share.toFixed(2)}% تركز`,
      ],
    });
  });

  // Largest Absolute Balances
  largestRows.forEach((r, idx) => {
    analysisRows.push({
      values: [
        'أكبر الحسابات رصيداً',
        `${idx + 1}. ${r.account.name}`,
        r.categoryName,
        r.directBalanceMinor / 100,
        getBalanceTypeLabel(r.directBalanceType),
      ],
    });
  });

  // Top Root Accounts by Consolidated Balance
  topRootRows.forEach((r, idx) => {
    analysisRows.push({
      values: [
        'أبرز الحسابات الرئيسية (بالرصيد المجمع)',
        `${idx + 1}. ${r.account.name}`,
        `${r.categoryName} (${r.descendantCount} تابع)`,
        r.consolidatedBalanceMinor / 100,
        getBalanceTypeLabel(r.consolidatedBalanceType),
      ],
    });
  });

  // Balanced & Zero-movement detail entries (top 15 each)
  balancedRows.slice(0, 15).forEach((r) => {
    analysisRows.push({
      values: ['الحسابات المتزنة', r.account.name, r.categoryName, 0, 'متزن'],
    });
  });

  zeroMovementRows.slice(0, 15).forEach((r) => {
    analysisRows.push({
      values: ['حسابات بدون حركة في الفترة', r.account.name, r.categoryName, r.directBalanceMinor / 100, 'بدون حركة'],
    });
  });

  if (analysisRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'التحليل المالي',
      'التحليل المالي المتقدم ونسب التركز',
      metaLine,
      analysisColumns,
      analysisRows
    );
  }

  // =========================================================================
  // SHEET 5: ملخص الحسابات الرئيسية (Root & Parent Summary)
  // =========================================================================
  const rootColumns: TableColumnSpec[] = [
    { header: 'الحساب الرئيسي', align: 'right', type: 'text', minWidth: 24 },
    { header: 'عدد الأبناء المباشرين', align: 'center', type: 'integer', minWidth: 16 },
    { header: 'إجمالي جميع التابعين', align: 'center', type: 'integer', minWidth: 16 },
    { header: `الرصيد المباشر للأب (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: `مجموع أرصدة التابعين (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'حالة الرصيد', align: 'center', type: 'text', minWidth: 16 },
  ];

  const rootSummarySource = report.rows.filter((r) => !r.account.parentId || r.isParent);
  let sumDirectKids = 0;
  let sumAllDesc = 0;
  let sumRootDirect = 0;
  let sumRootChildrenOnly = 0;
  let sumRootConsolidated = 0;

  // Prefer root accounts (!parentId) in totals to avoid counting intermediate sub-parents twice in totals
  const topLevelOnly = report.rows.filter((r) => !r.account.parentId);
  const rowsForSheet5 = topLevelOnly.length > 0 ? topLevelOnly : rootSummarySource;

  const rootSummaryRows = rowsForSheet5.map((r) => {
    sumDirectKids += r.directChildrenCount;
    sumAllDesc += r.descendantCount;
    sumRootDirect += r.directBalanceMinor;
    sumRootChildrenOnly += r.consolidatedChildrenOnlyMinor;
    sumRootConsolidated += r.consolidatedBalanceMinor;
    return {
      values: [
        r.account.name,
        r.directChildrenCount,
        r.descendantCount,
        r.directBalanceMinor / 100,
        r.consolidatedChildrenOnlyMinor / 100,
        r.consolidatedBalanceMinor / 100,
        r.categoryName,
        getBalanceTypeLabel(r.consolidatedBalanceType),
      ],
      isParent: r.isParent,
    };
  });

  if (rootSummaryRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'ملخص الحسابات الرئيسية',
      'ملخص الحسابات الرئيسية وأرصدة الفروع المجمعة',
      metaLine,
      rootColumns,
      rootSummaryRows,
      [
        'الإجمالي العام للحسابات الرئيسية',
        sumDirectKids,
        sumAllDesc,
        sumRootDirect / 100,
        sumRootChildrenOnly / 100,
        sumRootConsolidated / 100,
        `${rootSummaryRows.length} حساب`,
        sumRootConsolidated > 0 ? 'لك' : sumRootConsolidated < 0 ? 'عليك' : 'متزن',
      ]
    );
  }

  // =========================================================================
  // SHEET 6: الحركات (Added ONLY if movements exist)
  // =========================================================================
  if (filteredMovements.length > 0) {
    const txColumns: TableColumnSpec[] = [
      { header: 'التاريخ', align: 'center', type: 'date', minWidth: 13 },
      { header: 'الحساب', align: 'right', type: 'text', minWidth: 20 },
      { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
      { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `المبلغ الموقع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: 'نوع الحركة', align: 'center', type: 'text', minWidth: 14 },
      { header: 'هل هي حركة بينية', align: 'center', type: 'text', minWidth: 16 },
    ];

    let sumTxOwedBy = 0;
    let sumTxOwedTo = 0;
    let sumTxSigned = 0;

    const txRows = filteredMovements.map((t) => {
      const acc = hierarchyIndex.accountMap.get(t.accountId);
      const path = hierarchyIndex.getFormattedPath(t.accountId);
      const isOwedBy = t.entryType === 'owedByAccount';
      const owedByVal = isOwedBy ? t.amountMinor : 0;
      const owedToVal = !isOwedBy ? t.amountMinor : 0;
      const signed = getSignedTransactionMinor(t.entryType, t.amountMinor);

      sumTxOwedBy += owedByVal;
      sumTxOwedTo += owedToVal;
      sumTxSigned += signed;

      return {
        values: [
          t.date,
          acc?.name || 'حساب غير معروف',
          path || acc?.name || '',
          t.description,
          owedByVal / 100,
          owedToVal / 100,
          signed / 100,
          isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)',
          t.transferId ? 'نعم (حركة بينية)' : 'لا',
        ],
      };
    });

    createStyledTableSheet(
      workbook,
      'الحركات',
      'سجل الحركات التفصيلي للفترة',
      metaLine,
      txColumns,
      txRows,
      [
        'الإجمالي',
        `${filteredMovements.length} حركة`,
        '',
        '',
        sumTxOwedBy / 100,
        sumTxOwedTo / 100,
        sumTxSigned / 100,
        '',
        '',
      ]
    );
  }

  return workbook;
}

export interface SingleParentExcelParams {
  accountId: string;
  accounts: AccountModel[];
  transactions: TransactionModel[];
  categories: CategoryModel[];
  currencySymbol: string;
  currencyName?: string;
  ownerName?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Builds Single Parent / Consolidated Account Workbook:
 * 1. ملخص الحساب
 * 2. الفروع (added only if descendants exist)
 * 3. الحركات المجمعة (added only if movements exist)
 * 4. الأرصدة
 */
export function createSingleParentAccountWorkbook(
  params: SingleParentExcelParams
): ExcelJS.Workbook {
  const {
    accountId,
    accounts,
    transactions,
    categories,
    currencySymbol,
    currencyName,
    ownerName = 'المالك',
    fromDate,
    toDate,
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RAKAN BALANCE';
  workbook.created = new Date();

  const consolidated = calculateConsolidatedStatement(
    accountId,
    accounts,
    transactions,
    fromDate,
    toDate
  );

  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const rootCategory = categoryMap.get(consolidated.rootAccount.categoryId) || 'غير مصنف';
  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'كامل المدة';
  const exportDateStr = new Date().toISOString().slice(0, 10);
  const currencyLabel = currencyName ? `${currencyName} (${currencySymbol})` : currencySymbol;
  const metaLine = `الحساب: ${consolidated.rootAccount.name}  |  المالك: ${ownerName}  |  العملة: ${currencyLabel}  |  الفترة: ${periodLabel}  |  تاريخ التصدير: ${exportDateStr}`;

  const directKidsCount = accounts.filter((a) => a.parentId === accountId).length;
  const rootPath = consolidated.branchBreakdown[0]?.hierarchicalPath || consolidated.rootAccount.name;

  // =========================================================================
  // SHEET 1: ملخص الحساب
  // =========================================================================
  const summaryCols: TableColumnSpec[] = [
    { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
    { header: 'القيمة', align: 'left', type: 'currency', semanticColor: true, minWidth: 22 },
    { header: 'التوضيح', align: 'right', type: 'text', minWidth: 34 },
  ];

  const summarySheet = workbook.addWorksheet('ملخص الحساب');
  applyBannerAndMeta(summarySheet, 3, `كشف الحساب المجمع: ${consolidated.rootAccount.name}`, metaLine);
  const sHeader = summarySheet.getRow(4);
  sHeader.values = summaryCols.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(sHeader, 3);

  const summaryItems: Array<{ label: string; value: string | number; note: string; type: TableColumnSpec['type']; semantic?: boolean }> = [
    { label: 'اسم الحساب الرئيسي', value: consolidated.rootAccount.name, note: `التصنيف: ${rootCategory}`, type: 'text' },
    { label: 'المسار الهرمي', value: rootPath, note: 'الموقع في شجرة الحسابات', type: 'text' },
    { label: 'عدد الأبناء المباشرين', value: directKidsCount, note: 'الفروع المرتبطة مباشرة بهذا الحساب', type: 'integer' },
    { label: 'إجمالي التابعين في الشجرة', value: consolidated.descendantCount, note: 'جميع الفروع والأحفاد على كافة المستويات', type: 'integer' },
    { label: 'الفترة الزمنية', value: periodLabel, note: `تاريخ التصدير: ${exportDateStr}`, type: 'text' },
    { label: 'عدد الحركات المجمعة بالفترة', value: consolidated.rows.length, note: 'حركات الحساب الرئيسي مع جميع التابعين', type: 'integer' },
    { label: `رصيد أول المدة المجمع (${currencySymbol})`, value: consolidated.openingConsolidatedBalanceMinor / 100, note: 'الرصيد التاريخي للشجرة قبل بداية الفترة', type: 'currency', semantic: true },
    { label: `إجمالي عليه المجمع (${currencySymbol})`, value: consolidated.totalOwedByMinor / 100, note: 'مجموع حركات (عليه) للشجرة خلال الفترة', type: 'currency', semantic: true },
    { label: `إجمالي له المجمع (${currencySymbol})`, value: consolidated.totalOwedToMinor / 100, note: 'مجموع حركات (له) للشجرة خلال الفترة', type: 'currency' },
    { label: `الرصيد المباشر للحساب (${currencySymbol})`, value: consolidated.directBalanceMinor / 100, note: 'رصيد الحساب نفسه فقط دون الفروع', type: 'currency', semantic: true },
    { label: `مجموع أرصدة التابعين (${currencySymbol})`, value: consolidated.descendantsDirectSumMinor / 100, note: 'مجموع الأرصدة المباشرة لكافة الفروع والأحفاد', type: 'currency', semantic: true },
    { label: `الرصيد المجمع الختامي (${currencySymbol})`, value: consolidated.closingConsolidatedBalanceMinor / 100, note: 'الرصيد الكلي المجمع حتى نهاية الفترة', type: 'currency', semantic: true },
  ];

  summaryItems.forEach((item, idx) => {
    const row = summarySheet.getRow(5 + idx);
    row.height = 21;
    row.values = [
      sanitizeCellString(item.label),
      sanitizeCellString(item.value),
      sanitizeCellString(item.note),
    ];
    for (let c = 1; c <= 3; c++) {
      const spec: TableColumnSpec =
        c === 2
          ? { header: 'القيمة', align: typeof item.value === 'number' ? 'left' : 'right', type: item.type, semanticColor: item.semantic }
          : summaryCols[c - 1];
      styleDataCell(row.getCell(c), spec, idx);
    }
  });
  finalizeSheetLayout(summarySheet, 4, 4 + summaryItems.length, summaryCols);

  // =========================================================================
  // SHEET 2: الفروع (Added ONLY if descendants exist)
  // =========================================================================
  const branchOnlyList = consolidated.branchBreakdown.filter((b) => b.account.id !== accountId);
  if (branchOnlyList.length > 0) {
    const branchCols: TableColumnSpec[] = [
      { header: 'الحساب الفرعي / التابع', align: 'right', type: 'text', minWidth: 24 },
      { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
      { header: 'الأب المباشر', align: 'right', type: 'text', minWidth: 18 },
      { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
      { header: 'عدد التابعين', align: 'center', type: 'integer', minWidth: 12 },
      { header: `الرصيد الافتتاحي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: 'الحالة', align: 'center', type: 'text', minWidth: 12 },
    ];

    const rootLevel = consolidated.branchBreakdown[0]?.level ?? 0;
    const branchRows = branchOnlyList.map((b) => ({
      values: [
        b.account.name,
        b.level,
        b.parentName || consolidated.rootAccount.name,
        b.hierarchicalPath,
        b.descendantCount,
        b.openingBalanceMinor / 100,
        b.directBalanceMinor / 100,
        b.consolidatedBalanceMinor / 100,
        b.account.status === 'active' ? 'نشط' : 'مؤرشف',
      ],
      isParent: b.descendantCount > 0,
      indentCol0: Math.max(0, b.level - rootLevel) * 2,
    }));

    createStyledTableSheet(
      workbook,
      'الفروع',
      `الفروع والحسابات التابعة لحساب: ${consolidated.rootAccount.name}`,
      metaLine,
      branchCols,
      branchRows
    );
  }

  // =========================================================================
  // SHEET 3: الحركات المجمعة (Added ONLY if movements exist)
  // =========================================================================
  if (consolidated.rows.length > 0) {
    const movCols: TableColumnSpec[] = [
      { header: '#', align: 'center', type: 'integer', minWidth: 8 },
      { header: 'التاريخ', align: 'center', type: 'date', minWidth: 13 },
      { header: 'الحساب المصدر', align: 'right', type: 'text', minWidth: 20 },
      { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
      { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `المبلغ الموقع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 15 },
      { header: `الرصيد الجاري المجمع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 19 },
      { header: 'حركة بينية؟', align: 'center', type: 'text', minWidth: 13 },
    ];

    const movRows = consolidated.rows.map((r, idx) => {
      const isOwedBy = r.transaction.entryType === 'owedByAccount';
      return {
        values: [
          idx + 1,
          r.transaction.date,
          r.sourceAccountName,
          r.hierarchicalPath,
          r.transaction.description,
          isOwedBy ? r.transaction.amountMinor / 100 : 0,
          !isOwedBy ? r.transaction.amountMinor / 100 : 0,
          r.signedAmountMinor / 100,
          r.runningConsolidatedBalanceMinor / 100,
          r.transaction.transferId ? 'نعم' : 'لا',
        ],
      };
    });

    createStyledTableSheet(
      workbook,
      'الحركات المجمعة',
      `كشف الحركات المجمع: ${consolidated.rootAccount.name}`,
      metaLine,
      movCols,
      movRows,
      [
        '',
        'الإجمالي',
        `${consolidated.rows.length} حركة`,
        '',
        '',
        consolidated.totalOwedByMinor / 100,
        consolidated.totalOwedToMinor / 100,
        (consolidated.totalOwedByMinor - consolidated.totalOwedToMinor) / 100,
        consolidated.closingConsolidatedBalanceMinor / 100,
        '',
      ]
    );
  }

  // =========================================================================
  // SHEET 4: الأرصدة (Subtree Direct vs Consolidated Balances)
  // =========================================================================
  const balCols: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 24 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
    { header: `الافتتاحي المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `عليه بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `له بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: 'نوع الرصيد المجمع', align: 'center', type: 'text', minWidth: 16 },
  ];

  const rootLvl = consolidated.branchBreakdown[0]?.level ?? 0;
  let totalOpeningDirect = 0;
  let totalPeriodOwedBy = 0;
  let totalPeriodOwedTo = 0;
  let totalDirect = 0;

  const balRows = consolidated.branchBreakdown.map((b) => {
    totalOpeningDirect += b.openingBalanceMinor;
    totalPeriodOwedBy += b.periodOwedByMinor;
    totalPeriodOwedTo += b.periodOwedToMinor;
    totalDirect += b.directBalanceMinor;
    const cType = b.consolidatedBalanceMinor > 0 ? 'receivable' : b.consolidatedBalanceMinor < 0 ? 'payable' : 'balanced';
    return {
      values: [
        b.account.name,
        b.level,
        b.hierarchicalPath,
        b.openingBalanceMinor / 100,
        b.periodOwedByMinor / 100,
        b.periodOwedToMinor / 100,
        b.directBalanceMinor / 100,
        b.consolidatedBalanceMinor / 100,
        getBalanceTypeLabel(cType),
      ],
      isParent: b.account.id === accountId || b.descendantCount > 0,
      indentCol0: Math.max(0, b.level - rootLvl) * 2,
    };
  });

  createStyledTableSheet(
    workbook,
    'الأرصدة',
    `تفصيل أرصدة الشجرة: ${consolidated.rootAccount.name}`,
    metaLine,
    balCols,
    balRows,
    [
      'الإجمالي المجمع للشجرة',
      '',
      `${balRows.length} حساب`,
      totalOpeningDirect / 100,
      totalPeriodOwedBy / 100,
      totalPeriodOwedTo / 100,
      totalDirect / 100,
      consolidated.closingConsolidatedBalanceMinor / 100,
      consolidated.closingConsolidatedBalanceMinor > 0
        ? 'صافي لك'
        : consolidated.closingConsolidatedBalanceMinor < 0
        ? 'صافي عليك'
        : 'متزن',
    ]
  );

  return workbook;
}

/**
 * Exports Single Parent / Account Consolidated Report to Excel (.xlsx)
 */
export async function exportSingleParentAccountToExcel(
  params: SingleParentExcelParams
): Promise<void> {
  const workbook = createSingleParentAccountWorkbook(params);
  const accName = params.accounts.find((a) => a.id === params.accountId)?.name || 'Account';
  await downloadWorkbook(workbook, `Rakan_Balance_${accName}_Consolidated`);
}

/**
 * Exports Comprehensive Financial & Hierarchical Accounts Report to Excel (.xlsx)
 */
export async function exportComprehensiveAccountsReportToExcel(
  params: ComprehensiveExcelParams
): Promise<void> {
  const workbook = createComprehensiveAccountsWorkbook(params);
  await downloadWorkbook(workbook, 'Rakan_Balance_Comprehensive_Report');
}

/**
 * Export Accounts Balance Report to Excel
 * Preserves backward compatibility while using comprehensive multi-sheet workbook when full context is passed.
 */
export async function exportAccountsReportToExcel(
  rows: AccountBalanceReportRow[],
  currencySymbol: string,
  summary: { totalReceivable: number; totalPayable: number; netBalance: number },
  fullContext?: {
    accounts: AccountModel[];
    transactions: TransactionModel[];
    categories: CategoryModel[];
    currencyName?: string;
    ownerName?: string;
    filterOptions?: ReportFilterOptions;
  }
): Promise<void> {
  if (fullContext) {
    const workbook = createComprehensiveAccountsWorkbook({
      accounts: fullContext.accounts,
      transactions: fullContext.transactions,
      categories: fullContext.categories,
      currencySymbol,
      currencyName: fullContext.currencyName,
      ownerName: fullContext.ownerName,
      filterOptions: fullContext.filterOptions,
    });
    await downloadWorkbook(workbook, 'Rakan_Balance_Accounts_Report');
    return;
  }

  // Fallback styled workbook built directly from AccountBalanceReportRow[]
  const workbook = new ExcelJS.Workbook();
  const columns: TableColumnSpec[] = [
    { header: 'اسم الحساب', align: 'right', type: 'text', minWidth: 22 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: `الرصيد الافتتاحي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
    { header: `إجمالي عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `إجمالي له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `صافي الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 15 },
    { header: `الرصيد النهائي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: 'الحالة الحالية', align: 'center', type: 'text', minWidth: 14 },
    { header: 'حالة الحساب', align: 'center', type: 'text', minWidth: 12 },
  ];

  const dataRows = rows.map((r) => ({
    values: [
      r.account.name,
      r.categoryName,
      r.openingBalanceMinor / 100,
      r.totalOwedByMinor / 100,
      r.totalOwedToMinor / 100,
      r.netMovementMinor / 100,
      r.currentBalanceMinor / 100,
      r.balanceType === 'receivable' ? 'لك (له رصيد)' : r.balanceType === 'payable' ? 'عليك (مطلوب)' : 'متزن',
      r.account.status === 'active' ? 'نشط' : 'مؤرشف',
    ],
  }));

  createStyledTableSheet(
    workbook,
    'تقرير الأرصدة الشامل',
    'تقرير أرصدة الحسابات',
    `العملة: ${currencySymbol}  |  تاريخ التصدير: ${new Date().toISOString().slice(0, 10)}`,
    columns,
    dataRows,
    [
      'الإجمالي العام',
      `${rows.length} حساب`,
      '',
      summary.totalReceivable / 100,
      summary.totalPayable / 100,
      '',
      summary.netBalance / 100,
      summary.netBalance > 0 ? 'صافي لك' : summary.netBalance < 0 ? 'صافي عليك' : 'متزن',
      '',
    ]
  );

  await downloadWorkbook(workbook, 'Rakan_Balance_Accounts_Report');
}

/**
 * Export Category Summary Report to Excel
 */
export async function exportCategoriesReportToExcel(
  rows: CategorySummaryReportRow[],
  currencySymbol: string,
  grandTotals: { totalReceivable: number; totalPayable: number; grandNet: number }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const columns: TableColumnSpec[] = [
    { header: 'اسم التصنيف', align: 'right', type: 'text', minWidth: 24 },
    { header: 'عدد الحسابات النشطة', align: 'center', type: 'integer', minWidth: 16 },
    { header: `إجمالي لك (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: `إجمالي عليك (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 18 },
    { header: `صافي المركز المالي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 20 },
  ];

  const dataRows = rows.map((r) => ({
    values: [
      r.category.name,
      r.accountsCount,
      r.totalReceivableMinor / 100,
      r.totalPayableMinor / 100,
      r.netBalanceMinor / 100,
    ],
  }));

  createStyledTableSheet(
    workbook,
    'تقرير التصنيفات',
    'تقرير تجميع الأرصدة حسب التصنيفات',
    `العملة: ${currencySymbol}  |  تاريخ التصدير: ${new Date().toISOString().slice(0, 10)}`,
    columns,
    dataRows,
    [
      'الإجمالي العام لجميع التصنيفات',
      rows.reduce((sum, r) => sum + r.accountsCount, 0),
      grandTotals.totalReceivable / 100,
      grandTotals.totalPayable / 100,
      grandTotals.grandNet / 100,
    ]
  );

  await downloadWorkbook(workbook, 'Rakan_Balance_Category_Summary');
}

/**
 * Export Period Summary Statement to Excel
 */
export async function exportPeriodReportToExcel(
  rows: PeriodTransactionRow[],
  currencySymbol: string,
  meta: { fromDate?: string; toDate?: string; openingMinor: number; closingMinor: number }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const columns: TableColumnSpec[] = [
    { header: 'التاريخ', align: 'center', type: 'date', minWidth: 13 },
    { header: 'اسم الحساب', align: 'right', type: 'text', minWidth: 22 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'نوع الحركة', align: 'center', type: 'text', minWidth: 16 },
    { header: 'البيان / الوصف', align: 'right', type: 'text', minWidth: 28 },
    { header: `المبلغ (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 16 },
    { header: `المبلغ الموقع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: 'الملاحظات', align: 'right', type: 'text', minWidth: 22 },
  ];

  const dataRows = rows.map((r) => ({
    values: [
      r.transaction.date,
      r.accountName,
      r.categoryName,
      r.transaction.entryType === 'owedByAccount' ? 'عليه (يزيد الدين)' : 'له (ينقص الدين)',
      r.transaction.description,
      r.transaction.amountMinor / 100,
      r.signedAmountMinor / 100,
      r.transaction.notes || '',
    ],
  }));

  const metaLine = `الفترة: ${meta.fromDate || 'البداية'} إلى ${meta.toDate || 'اليوم'}  |  افتتاحي: ${(meta.openingMinor / 100).toFixed(2)} ${currencySymbol}  |  ختامي: ${(meta.closingMinor / 100).toFixed(2)} ${currencySymbol}`;

  createStyledTableSheet(
    workbook,
    'كشف الحركة الشامل',
    'تقرير حركات الفترة الزمنية',
    metaLine,
    columns,
    dataRows,
    [
      'الإجمالي',
      `${rows.length} حركة`,
      '',
      '',
      '',
      rows.reduce((s, r) => s + r.transaction.amountMinor, 0) / 100,
      rows.reduce((s, r) => s + r.signedAmountMinor, 0) / 100,
      '',
    ]
  );

  await downloadWorkbook(workbook, 'Rakan_Balance_Period_Statement');
}

/**
 * Export Debtors / Creditors Report to Excel
 */
export async function exportDebtorsCreditorsReportToExcel(
  debtors: PartyRow[],
  creditors: PartyRow[],
  currencySymbol: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const dateStr = new Date().toISOString().slice(0, 10);

  if (debtors.length > 0 || creditors.length === 0) {
    const debtorCols: TableColumnSpec[] = [
      { header: 'اسم الحساب (المدين)', align: 'right', type: 'text', minWidth: 24 },
      { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
      { header: `الرصيد لك (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
      { header: 'نسبة التركز (%)', align: 'center', type: 'percent', minWidth: 15 },
    ];
    const debtorData = debtors.map((d) => ({
      values: [
        d.account.name,
        d.categoryName,
        d.balanceMinor / 100,
        Number(d.sharePercentage.toFixed(2)),
      ],
    }));

    createStyledTableSheet(
      workbook,
      'المدينون (لك)',
      'تقرير المدينين — حقوقك (لك)',
      `العملة: ${currencySymbol}  |  تاريخ التصدير: ${dateStr}`,
      debtorCols,
      debtorData,
      [
        'الإجمالي',
        `${debtors.length} مدين`,
        debtors.reduce((s, d) => s + d.balanceMinor, 0) / 100,
        debtors.length > 0 ? 100 : 0,
      ]
    );
  }

  if (creditors.length > 0 || debtors.length === 0) {
    const creditorCols: TableColumnSpec[] = [
      { header: 'اسم الحساب (الدائن)', align: 'right', type: 'text', minWidth: 24 },
      { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
      { header: `المبلغ عليك (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 18 },
      { header: 'نسبة التركز (%)', align: 'center', type: 'percent', minWidth: 15 },
    ];
    const creditorData = creditors.map((c) => ({
      values: [
        c.account.name,
        c.categoryName,
        c.absBalanceMinor / 100,
        Number(c.sharePercentage.toFixed(2)),
      ],
    }));

    createStyledTableSheet(
      workbook,
      'الدائنون (عليك)',
      'تقرير الدائنين — التزاماتك (عليك)',
      `العملة: ${currencySymbol}  |  تاريخ التصدير: ${dateStr}`,
      creditorCols,
      creditorData,
      [
        'الإجمالي',
        `${creditors.length} دائن`,
        creditors.reduce((s, c) => s + c.absBalanceMinor, 0) / 100,
        creditors.length > 0 ? 100 : 0,
      ]
    );
  }

  await downloadWorkbook(workbook, 'Rakan_Balance_Debtors_Creditors');
}
