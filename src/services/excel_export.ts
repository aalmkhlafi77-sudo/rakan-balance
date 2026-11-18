/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Professional Multi-Sheet Excel Export Service (.xlsx)
 * Uses security-patched @andreeewill/exceljs to generate formula-injection-safe,
 * styled, RTL-oriented workbooks with Freeze Panes, AutoFilter on detailed tables,
 * rich numeric formatting (#,##0.00), true hierarchical indentation, and zero double counting.
 */

import ExcelJS from '@andreeewill/exceljs';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';
import { calculateAccountStatement, getSignedTransactionMinor } from '../domain/balance_calculator.ts';
import { sanitizeSpreadsheetText } from '../domain/account_privacy.ts';
import {
  AccountBalanceReportRow,
  CategorySummaryReportRow,
  PartyRow,
  PeriodTransactionRow,
  ReportFilterOptions,
} from '../domain/financial_reports.ts';
import {
  calculateConsolidatedStatement,
  formatAccountPath,
  generateHierarchicalAccountsReport,
  HierarchicalAccountsReport,
  HierarchyStatusScope,
} from '../domain/hierarchical_accounts.ts';

/**
 * Sanitizes cell text to prevent Excel Formula Injection (=, +, -, @, \t, \r)
 */
export function sanitizeCellString(val: unknown): string | number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  return sanitizeSpreadsheetText(val);
}

function getDisplayWidth(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 3;
  }
  const s = String(value);
  const hasArabic = /[\u0600-\u06FF]/.test(s);
  return Math.ceil(s.length * (hasArabic ? 1.28 : 1.08));
}

const THIN_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFCBD5E1' },
};

const MEDIUM_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'medium',
  color: { argb: 'FF334155' },
};

const DOUBLE_BORDER_SIDE: Partial<ExcelJS.Border> = {
  style: 'double',
  color: { argb: 'FF065F46' },
};

const COLORS = {
  titleFill: 'FF064E3B', // Deep Emerald Charcoal
  titleText: 'FFFFFFFF',
  metaFill: 'FFF1F5F9',
  metaText: 'FF334155',
  headerFill: 'FF0F766E', // Rich Teal Emerald
  headerText: 'FFFFFFFF',
  sectionFill: 'FFD1FAE5', // Soft Emerald Section Header
  sectionGoldFill: 'FFFEF3C7', // Subtle Gold Accent Section Header
  sectionText: 'FF064E3B',
  zebraFill: 'FFF8FAFC',
  whiteFill: 'FFFFFFFF',
  parentFill: 'FFECFDF5',
  totalFill: 'FFE2E8F0',
  positiveText: 'FF047857', // Emerald
  negativeText: 'FFBE123C', // Rose
  consolidatedText: 'FFB45309', // Rich Gold Accent for Consolidated Columns
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

  // Row 1: Top Dark Emerald Title Banner
  worksheet.mergeCells(1, 1, 1, safeColCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = sanitizeCellString(title);
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: COLORS.titleText } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleFill } };
  titleCell.alignment = { horizontal: 'right', vertical: 'middle' };
  titleCell.border = { bottom: MEDIUM_BORDER_SIDE };
  worksheet.getRow(1).height = 32;

  // Row 2: Metadata Info Block
  worksheet.mergeCells(2, 1, 2, safeColCount);
  const metaCell = worksheet.getCell(2, 1);
  metaCell.value = sanitizeCellString(metaLine);
  metaCell.font = { name: 'Arial', size: 10, bold: false, color: { argb: COLORS.metaText } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.metaFill } };
  metaCell.alignment = { horizontal: 'right', vertical: 'middle' };
  metaCell.border = { bottom: THIN_BORDER_SIDE };
  worksheet.getRow(2).height = 23;

  // Row 3: Clean Visual Spacer
  worksheet.getRow(3).height = 8;
}

function styleTableHeaderRow(row: ExcelJS.Row, colCount: number): void {
  row.height = 27;
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

function styleSectionHeaderRow(
  row: ExcelJS.Row,
  colCount: number,
  title: string,
  accent: 'emerald' | 'gold' = 'emerald'
): void {
  row.height = 24;
  const fillColor = accent === 'gold' ? COLORS.sectionGoldFill : COLORS.sectionFill;
  const values: string[] = [String(sanitizeCellString(title))];
  for (let c = 2; c <= colCount; c++) values.push('');
  row.values = values;

  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.sectionText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = {
      top: MEDIUM_BORDER_SIDE,
      bottom: THIN_BORDER_SIDE,
      left: THIN_BORDER_SIDE,
      right: THIN_BORDER_SIDE,
    };
  }
}

interface TableColumnSpec {
  header: string;
  align?: 'right' | 'center' | 'left';
  type?: 'text' | 'currency' | 'integer' | 'percent' | 'date';
  semanticColor?: boolean;
  consolidatedAccent?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

function finalizeSheetLayout(
  worksheet: ExcelJS.Worksheet,
  headerRowNum: number,
  lastFilterRowNum: number,
  columns: TableColumnSpec[],
  enableAutoFilter = true
): void {
  const colCount = columns.length;

  worksheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: headerRowNum }];

  if (enableAutoFilter && lastFilterRowNum >= headerRowNum) {
    worksheet.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: lastFilterRowNum, column: colCount },
    };
  }

  for (let c = 1; c <= colCount; c++) {
    const spec = columns[c - 1];
    let maxLen = getDisplayWidth(spec.header) + 4;
    const col = worksheet.getColumn(c);

    for (let r = headerRowNum; r <= worksheet.rowCount; r++) {
      const val = worksheet.getRow(r).getCell(c).value;
      const w = getDisplayWidth(val);
      if (w > maxLen) maxLen = w;
    }

    const minW = spec.minWidth ?? 12;
    const maxW = spec.maxWidth ?? 52;
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
  if (spec.consolidatedAccent && typeof cell.value === 'number') {
    if (cell.value < 0) textColor = COLORS.negativeText;
    else textColor = COLORS.consolidatedText;
  } else if (spec.semanticColor && typeof cell.value === 'number') {
    if (cell.value > 0) textColor = COLORS.positiveText;
    else if (cell.value < 0) textColor = COLORS.negativeText;
    else textColor = COLORS.neutralText;
  }

  cell.font = {
    name: 'Arial',
    size: isTotal ? 11 : 10,
    bold: isParent || isTotal || Boolean(spec.consolidatedAccent),
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
  totalsRow?: (string | number)[],
  enableAutoFilter = true
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

  finalizeSheetLayout(worksheet, headerRowNum, lastFilterRowNum, columns, enableAutoFilter);
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

function getStatusScopeLabel(status?: HierarchyStatusScope): string {
  if (status === 'active') return 'الحسابات النشطة فقط';
  if (status === 'archived') return 'الحسابات المؤرشفة فقط';
  return 'الكل (النشطة والمؤرشفة)';
}

/**
 * Builds the 6-sheet Comprehensive Financial & Hierarchical Workbook (ExcelJS):
 * 1. الملخص العام (Executive Dashboard with clear sections: معلومات التقرير / مؤشرات مالية / مؤشرات تشغيلية)
 * 2. ملخص الحسابات الرئيسية (Root accounts with direct children, descendants, opening, movements, direct, branches, consolidated + non-double-counted Totals)
 * 3. الأرصدة التفصيلية (Opening at period, owedBy, owedTo, net movement, closing balance, status + Totals)
 * 4. الشجرة المالية (Real alignment.indent, bold + tint + top border on parent rows, consolidated emphasis)
 * 5. الحركات (Created ONLY if movements exist: date, account, path, type, desc, owedBy, owedTo, net effect, cumulative running balance)
 * 6. التحليل المالي (Structured analytical sections: Top 10 Debtors, Top 10 Creditors, Top 10 Roots, Balanced, Zero-Movement)
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
  const statusLabel = getStatusScopeLabel(filterOptions.status);
  const currencyLabel = currencyName ? `${currencyName} (${currencySymbol})` : currencySymbol;
  const metaLine = `المالك: ${ownerName}  |  العملة: ${currencyLabel}  |  الفترة: ${periodLabel}  |  النطاق: ${statusLabel}  |  التصدير: ${exportDateStr}`;

  // =========================================================================
  // SHEET 1: الملخص العام (Structured Executive Dashboard — No AutoFilter)
  // =========================================================================
  const kpiColumns: TableColumnSpec[] = [
    { header: 'البند / المؤشر', align: 'right', type: 'text', minWidth: 30 },
    { header: 'القيمة', align: 'left', type: 'currency', semanticColor: true, minWidth: 22 },
    { header: 'الوحدة / النوع', align: 'center', type: 'text', minWidth: 16 },
    { header: 'التوضيح التحليلي', align: 'right', type: 'text', minWidth: 40 },
  ];

  const kpiSheet = workbook.addWorksheet('الملخص العام');
  applyBannerAndMeta(kpiSheet, 4, `RAKAN BALANCE — ${reportTitle}`, metaLine);
  const kpiHeader = kpiSheet.getRow(4);
  kpiHeader.values = kpiColumns.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(kpiHeader, 4);

  type DashboardItem =
    | { kind: 'section'; title: string; accent?: 'emerald' | 'gold' }
    | {
        kind: 'metric';
        label: string;
        value: string | number;
        unit: string;
        note: string;
        type: TableColumnSpec['type'];
        semantic?: boolean;
        consolidated?: boolean;
      };

  const exec = report.executiveSummary;
  const ops = report.periodOperations;

  const dashboardItems: DashboardItem[] = [
    { kind: 'section', title: '1. معلومات التقرير', accent: 'gold' },
    { kind: 'metric', label: 'اسم النظام', value: 'RAKAN BALANCE (راكان بلانس)', unit: 'منصة مالية', note: 'نظام محاسبي هرمي تحليلي', type: 'text' },
    { kind: 'metric', label: 'اسم التقرير', value: reportTitle, unit: 'متعدد الشيتات', note: 'الأرصدة المباشرة والمجمعة دون احتساب مزدوج', type: 'text' },
    { kind: 'metric', label: 'اسم المالك', value: ownerName, unit: 'صاحب الدفتر', note: 'الكيان المالي المعتمد', type: 'text' },
    { kind: 'metric', label: 'العملة المحلية', value: currencyLabel, unit: currencySymbol, note: 'العملة الموحدة لجميع المؤشرات', type: 'text' },
    { kind: 'metric', label: 'الفترة الزمنية', value: periodLabel, unit: 'نطاق التاريخ', note: filterOptions.toDate ? `الرصيد محسوب بدقة حتى ${filterOptions.toDate}` : 'شامل جميع الحركات', type: 'text' },
    { kind: 'metric', label: 'نطاق حالة الحسابات', value: statusLabel, unit: 'فلتر الحالة', note: 'ينطبق بشكل موحد على الحسابات والتجميع', type: 'text' },
    { kind: 'metric', label: 'تاريخ التصدير', value: exportDateStr, unit: 'YYYY-MM-DD', note: 'تاريخ إنشاء التقرير', type: 'text' },

    { kind: 'section', title: '2. مؤشرات مالية', accent: 'emerald' },
    { kind: 'metric', label: 'إجمالي لك (حقوقك المباشرة)', value: exec.totalDirectReceivableMinor / 100, unit: currencySymbol, note: 'مجموع الأرصدة المباشرة الموجبة دون تكرار', type: 'currency', semantic: true },
    { kind: 'metric', label: 'إجمالي عليك (التزاماتك المباشرة)', value: exec.totalDirectPayableMinor / 100, unit: currencySymbol, note: 'مجموع الأرصدة المباشرة السالبة دون تكرار', type: 'currency' },
    { kind: 'metric', label: 'صافي المركز المالي المباشر', value: exec.netDirectBalanceMinor / 100, unit: currencySymbol, note: 'الفرق الصافي = إجمالي لك - إجمالي عليك', type: 'currency', semantic: true },
    { kind: 'metric', label: 'رصيد أول الفترة الإجمالي', value: exec.totalOpeningAtPeriodMinor / 100, unit: currencySymbol, note: 'الافتتاحي + الحركات ما قبل تاريخ البداية', type: 'currency', semantic: true },
    { kind: 'metric', label: 'إجمالي حركة عليه للفترة', value: exec.totalPeriodOwedByMinor / 100, unit: currencySymbol, note: 'إجمالي الحركات المدينة خلال الفترة المحددة', type: 'currency', semantic: true },
    { kind: 'metric', label: 'إجمالي حركة له للفترة', value: exec.totalPeriodOwedToMinor / 100, unit: currencySymbol, note: 'إجمالي الحركات الدائنة خلال الفترة المحددة', type: 'currency' },
    { kind: 'metric', label: 'صافي حركة الفترة', value: exec.totalPeriodNetMovementMinor / 100, unit: currencySymbol, note: 'إجمالي عليه - إجمالي له خلال الفترة', type: 'currency', semantic: true },
    { kind: 'metric', label: 'رصيد آخر الفترة الإجمالي', value: exec.totalClosingDirectBalanceMinor / 100, unit: currencySymbol, note: 'يساوي: رصيد أول الفترة + صافي حركة الفترة', type: 'currency', semantic: true },

    { kind: 'section', title: '3. مؤشرات تشغيلية', accent: 'emerald' },
    { kind: 'metric', label: 'إجمالي الحسابات بالتقرير', value: exec.accountsCount, unit: 'حساب', note: 'الحسابات المطابقة للفلتر المحدد', type: 'integer' },
    { kind: 'metric', label: 'عدد الحسابات الرئيسية (الجذور)', value: exec.rootAccountsCount, unit: 'حساب رئيسي', note: 'حسابات المستوى الأول', type: 'integer' },
    { kind: 'metric', label: 'عدد الحسابات الفرعية والتابعة', value: exec.branchAccountsCount, unit: 'حساب فرعي', note: 'فروع وأحفاد مرتبطة بحسابات أب', type: 'integer' },
    { kind: 'metric', label: 'حسابات حدثت عليها حركة بالفترة', value: exec.accountsWithActivityCount, unit: 'حساب نشط', note: 'عدد الحسابات التي سجلت قيداً واحداً على الأقل', type: 'integer' },
    { kind: 'metric', label: 'عدد الحركات خلال الفترة', value: ops.transactionsCount, unit: 'حركة', note: 'إجمالي العمليات ضمن نطاق الفترة', type: 'integer' },
    { kind: 'metric', label: 'أكبر حركة مالية مسجلة', value: ops.largestTransactionMinor / 100, unit: currencySymbol, note: ops.largestTransactionAccountName ? `على حساب: ${ops.largestTransactionAccountName}` : 'لا توجد حركات بالفترة', type: 'currency', semantic: true },
    { kind: 'metric', label: 'متوسط قيمة الحركة', value: ops.averageTransactionMinor / 100, unit: currencySymbol, note: 'متوسط حجم العملية خلال الفترة', type: 'currency' },
  ];

  let dashRowNum = 4;
  let metricIdx = 0;
  for (const item of dashboardItems) {
    dashRowNum++;
    const row = kpiSheet.getRow(dashRowNum);
    if (item.kind === 'section') {
      styleSectionHeaderRow(row, 4, item.title, item.accent ?? 'emerald');
    } else {
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
            ? {
                header: 'القيمة',
                align: typeof item.value === 'number' ? 'left' : 'right',
                type: item.type,
                semanticColor: item.semantic,
                consolidatedAccent: item.consolidated,
              }
            : kpiColumns[c - 1];
        styleDataCell(row.getCell(c), colSpec, metricIdx);
      }
      metricIdx++;
    }
  }
  finalizeSheetLayout(kpiSheet, 4, dashRowNum, kpiColumns, false);

  // =========================================================================
  // SHEET 2: ملخص الحسابات الرئيسية (Root Accounts Consolidated & Period Table)
  // =========================================================================
  const rootColumns: TableColumnSpec[] = [
    { header: 'الحساب الرئيسي', align: 'right', type: 'text', minWidth: 24 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'عدد الأبناء', align: 'center', type: 'integer', minWidth: 12 },
    { header: 'إجمالي التابعين', align: 'center', type: 'integer', minWidth: 14 },
    { header: `رصيد أول الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `صافي الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `رصيد الفروع (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', consolidatedAccent: true, minWidth: 18 },
    { header: 'نوع المجمع', align: 'center', type: 'text', minWidth: 16 },
  ];

  let sumRootKids = 0;
  let sumRootDesc = 0;
  let sumRootOpen = 0;
  let sumRootOwedBy = 0;
  let sumRootOwedTo = 0;
  let sumRootNetMov = 0;
  let sumRootDirect = 0;
  let sumRootBranches = 0;
  let sumRootConsolidated = 0;

  const rootSummaryRows = report.rootSummaries.map((r) => {
    sumRootKids += r.directChildrenCount;
    sumRootDesc += r.descendantCount;
    sumRootOpen += r.consolidatedOpeningAtPeriodMinor;
    sumRootOwedBy += r.consolidatedOwedByMinor;
    sumRootOwedTo += r.consolidatedOwedToMinor;
    sumRootNetMov += r.consolidatedNetMovementMinor;
    sumRootDirect += r.directBalanceMinor;
    sumRootBranches += r.consolidatedChildrenOnlyMinor;
    sumRootConsolidated += r.consolidatedBalanceMinor;

    return {
      values: [
        r.account.name,
        r.categoryName,
        r.directChildrenCount,
        r.descendantCount,
        r.consolidatedOpeningAtPeriodMinor / 100,
        r.consolidatedOwedByMinor / 100,
        r.consolidatedOwedToMinor / 100,
        r.consolidatedNetMovementMinor / 100,
        r.directBalanceMinor / 100,
        r.consolidatedChildrenOnlyMinor / 100,
        r.consolidatedBalanceMinor / 100,
        getBalanceTypeLabel(r.consolidatedBalanceType),
      ],
      isParent: r.descendantCount > 0,
    };
  });

  if (rootSummaryRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'ملخص الحسابات الرئيسية',
      'ملخص الحسابات الرئيسية والفروع (مجمع دون تكرار)',
      metaLine,
      rootColumns,
      rootSummaryRows,
      [
        'الإجمالي العام للحسابات الرئيسية',
        `${rootSummaryRows.length} حساب رئيسي`,
        sumRootKids,
        sumRootDesc,
        sumRootOpen / 100,
        sumRootOwedBy / 100,
        sumRootOwedTo / 100,
        sumRootNetMov / 100,
        sumRootDirect / 100,
        sumRootBranches / 100,
        sumRootConsolidated / 100,
        sumRootConsolidated > 0 ? 'لك' : sumRootConsolidated < 0 ? 'عليك' : 'متزن',
      ],
      true
    );
  }

  // =========================================================================
  // SHEET 3: الأرصدة التفصيلية (Opening + OwedBy - OwedTo = Closing Direct)
  // =========================================================================
  const detailedColumns: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 24 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'الأب', align: 'right', type: 'text', minWidth: 18 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: `رصيد أول الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `صافي الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
    { header: `رصيد آخر الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'نوع الرصيد', align: 'center', type: 'text', minWidth: 16 },
    { header: 'الحالة', align: 'center', type: 'text', minWidth: 12 },
  ];

  let sumOpening = 0;
  let sumOwedBy = 0;
  let sumOwedTo = 0;
  let sumNetMov = 0;
  let sumDirect = 0;

  const detailedRows = report.rows.map((r) => {
    sumOpening += r.openingAtPeriodMinor;
    sumOwedBy += r.directOwedByMinor;
    sumOwedTo += r.directOwedToMinor;
    sumNetMov += r.directNetMovementMinor;
    sumDirect += r.directBalanceMinor;
    return {
      values: [
        r.account.name,
        r.categoryName,
        r.parentName || '— (رئيسي)',
        r.level,
        r.openingAtPeriodMinor / 100,
        r.directOwedByMinor / 100,
        r.directOwedToMinor / 100,
        r.directNetMovementMinor / 100,
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
        sumNetMov / 100,
        sumDirect / 100,
        sumDirect > 0 ? 'صافي لك' : sumDirect < 0 ? 'صافي عليك' : 'متزن',
        '',
      ],
      true
    );
  }

  // =========================================================================
  // SHEET 4: الشجرة المالية (Hierarchical Indentation & Consolidated Balances)
  // =========================================================================
  const treeColumns: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 28 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: 'الأب', align: 'right', type: 'text', minWidth: 18 },
    { header: 'عدد التابعين', align: 'center', type: 'integer', minWidth: 12 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `رصيد التابعين (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', consolidatedAccent: true, minWidth: 18 },
    { header: 'نوع الرصيد المجمع', align: 'center', type: 'text', minWidth: 18 },
    { header: 'الحالة', align: 'center', type: 'text', minWidth: 12 },
  ];

  const treeRows = report.rows.map((r) => ({
    values: [
      r.account.name,
      r.categoryName,
      r.level,
      r.parentName || '— (جذر)',
      r.descendantCount,
      r.directBalanceMinor / 100,
      r.consolidatedChildrenOnlyMinor / 100,
      r.consolidatedBalanceMinor / 100,
      getBalanceTypeLabel(r.consolidatedBalanceType),
      r.account.status === 'active' ? 'نشط' : 'مؤرشف',
    ],
    isParent: r.isParent,
    indentCol0: r.level * 2,
  }));

  if (treeRows.length > 0) {
    createStyledTableSheet(
      workbook,
      'الشجرة المالية',
      'الشجرة المالية (الرصيد المباشر + رصيد التابعين + الرصيد المجمع)',
      metaLine,
      treeColumns,
      treeRows,
      undefined,
      true
    );
  }

  // =========================================================================
  // SHEET 5: الحركات (Added ONLY if period movements exist)
  // =========================================================================
  if (report.movements.length > 0) {
    const txColumns: TableColumnSpec[] = [
      { header: 'التاريخ', align: 'center', type: 'date', minWidth: 13 },
      { header: 'الحساب', align: 'right', type: 'text', minWidth: 20 },
      { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
      { header: 'نوع الحركة', align: 'center', type: 'text', minWidth: 14 },
      { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `صافي الأثر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `الرصيد الجاري التراكمي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 20 },
      { header: 'حركة بينية؟', align: 'center', type: 'text', minWidth: 14 },
    ];

    let sumTxOwedBy = 0;
    let sumTxOwedTo = 0;
    let sumTxSigned = 0;

    const txRows = report.movements.map((m) => {
      const t = m.transaction;
      const isOwedBy = t.entryType === 'owedByAccount';
      const owedByVal = isOwedBy ? t.amountMinor : 0;
      const owedToVal = !isOwedBy ? t.amountMinor : 0;

      sumTxOwedBy += owedByVal;
      sumTxOwedTo += owedToVal;
      sumTxSigned += m.signedAmountMinor;

      return {
        values: [
          t.date,
          m.accountName,
          m.hierarchicalPath,
          isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)',
          t.description,
          owedByVal / 100,
          owedToVal / 100,
          m.signedAmountMinor / 100,
          m.cumulativeRunningMinor / 100,
          t.transferId ? 'نعم' : 'لا',
        ],
      };
    });

    const lastCumulative = report.movements[report.movements.length - 1]?.cumulativeRunningMinor ?? report.totalClosingDirectBalanceMinor;

    createStyledTableSheet(
      workbook,
      'الحركات',
      'سجل الحركات التفصيلي للفترة',
      metaLine,
      txColumns,
      txRows,
      [
        'الإجمالي',
        `${report.movements.length} حركة`,
        '',
        '',
        '',
        sumTxOwedBy / 100,
        sumTxOwedTo / 100,
        sumTxSigned / 100,
        lastCumulative / 100,
        '',
      ],
      true
    );
  }

  // =========================================================================
  // SHEET 6: التحليل المالي (Structured Analytical Sections — No AutoFilter)
  // =========================================================================
  const analysisColumns: TableColumnSpec[] = [
    { header: 'الحساب / البند', align: 'right', type: 'text', minWidth: 26 },
    { header: 'المسار / التصنيف', align: 'right', type: 'text', minWidth: 28 },
    { header: 'الوصف / الحالة', align: 'center', type: 'text', minWidth: 16 },
    { header: `القيمة / الرصيد (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'التركز / آخر حركة', align: 'center', type: 'text', minWidth: 20 },
  ];

  const analysis = report.financialAnalysis;
  const hasAnyAnalysis =
    report.rows.length > 0 ||
    analysis.top10Debtors.length > 0 ||
    analysis.top10Creditors.length > 0 ||
    analysis.top10RootsByConsolidated.length > 0;

  if (hasAnyAnalysis) {
    const analysisSheet = workbook.addWorksheet('التحليل المالي');
    applyBannerAndMeta(analysisSheet, 5, 'التحليل المالي والتركز والحسابات الخاملة', metaLine);
    const aHeader = analysisSheet.getRow(4);
    aHeader.values = analysisColumns.map((c) => sanitizeCellString(c.header));
    styleTableHeaderRow(aHeader, 5);

    let aRowNum = 4;
    let aIdx = 0;

    const appendSection = (
      title: string,
      accent: 'emerald' | 'gold',
      entries: Array<{ values: (string | number)[]; consolidatedCol3?: boolean }>
    ) => {
      if (entries.length === 0) return;
      aRowNum++;
      styleSectionHeaderRow(analysisSheet.getRow(aRowNum), 5, title, accent);
      for (const entry of entries) {
        aRowNum++;
        const row = analysisSheet.getRow(aRowNum);
        row.height = 20;
        row.values = entry.values.map((v) => sanitizeCellString(v));
        for (let c = 1; c <= 5; c++) {
          const spec: TableColumnSpec =
            c === 4 && entry.consolidatedCol3
              ? { ...analysisColumns[3], semanticColor: false, consolidatedAccent: true }
              : analysisColumns[c - 1];
          styleDataCell(row.getCell(c), spec, aIdx);
        }
        aIdx++;
      }
    };

    appendSection(
      '1. أعلى الحسابات لك (Top 10 مدينون)',
      'emerald',
      analysis.top10Debtors.map((r, idx) => {
        const share = report.totalDirectReceivableMinor > 0 ? (r.directBalanceMinor / report.totalDirectReceivableMinor) * 100 : 0;
        return {
          values: [
            `${idx + 1}. ${r.account.name}`,
            r.hierarchicalPath || r.categoryName,
            r.categoryName,
            r.directBalanceMinor / 100,
            `${share.toFixed(2)}% تركز`,
          ],
        };
      })
    );

    appendSection(
      '2. أعلى الحسابات عليك (Top 10 دائنون)',
      'emerald',
      analysis.top10Creditors.map((r, idx) => {
        const absBal = Math.abs(r.directBalanceMinor);
        const share = report.totalDirectPayableMinor > 0 ? (absBal / report.totalDirectPayableMinor) * 100 : 0;
        return {
          values: [
            `${idx + 1}. ${r.account.name}`,
            r.hierarchicalPath || r.categoryName,
            r.categoryName,
            r.directBalanceMinor / 100,
            `${share.toFixed(2)}% تركز`,
          ],
        };
      })
    );

    appendSection(
      '3. أعلى الحسابات الرئيسية (بالرصيد المجمع)',
      'gold',
      analysis.top10RootsByConsolidated.map((r, idx) => ({
        values: [
          `${idx + 1}. ${r.account.name}`,
          `${r.categoryName} (${r.descendantCount} تابع)`,
          getBalanceTypeLabel(r.consolidatedBalanceType),
          r.consolidatedBalanceMinor / 100,
          `${r.directChildrenCount} فرع مباشر`,
        ],
        consolidatedCol3: true,
      }))
    );

    appendSection(
      '4. الحسابات المتزنة (الرصيد = 0)',
      'emerald',
      analysis.balancedAccounts.map((r) => ({
        values: [
          r.account.name,
          r.hierarchicalPath || r.categoryName,
          r.categoryName,
          0,
          r.lastTransactionDate ? `آخر حركة: ${r.lastTransactionDate}` : 'لا توجد حركات',
        ],
      }))
    );

    appendSection(
      '5. الحسابات بدون حركة خلال الفترة',
      'emerald',
      analysis.zeroMovementAccounts.map((r) => ({
        values: [
          r.account.name,
          r.hierarchicalPath || r.categoryName,
          r.categoryName,
          r.directBalanceMinor / 100,
          r.lastTransactionDate ? `آخر حركة: ${r.lastTransactionDate}` : 'لم تسجل حركة مسبقة',
        ],
      }))
    );

    finalizeSheetLayout(analysisSheet, 4, aRowNum, analysisColumns, false);
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
  statusScope?: HierarchyStatusScope;
}

/**
 * Builds Direct-Only Account Statement Workbook (Mode === 'direct').
 * STRICT ISOLATION: Includes ONLY this single account's own summary, direct movements, and direct balance.
 * NEVER includes child branches or descendant movements.
 */
export function createDirectAccountWorkbook(
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

  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    throw new Error(`الحساب غير موجود: ${accountId}`);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RAKAN BALANCE';
  workbook.created = new Date();

  const statement = calculateAccountStatement(account, transactions, fromDate, toDate);
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const categoryName = categoryMap.get(account.categoryId) || 'غير مصنف';
  const accountPath = formatAccountPath(account.id, accounts) || account.name;
  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'كامل المدة';
  const exportDateStr = new Date().toISOString().slice(0, 10);
  const currencyLabel = currencyName ? `${currencyName} (${currencySymbol})` : currencySymbol;
  const metaLine = `كشف مباشر للحساب: ${account.name}  |  المالك: ${ownerName}  |  العملة: ${currencyLabel}  |  الفترة: ${periodLabel}  |  التصدير: ${exportDateStr}`;

  const netPeriodMinor = statement.totalOwedByMinor - statement.totalOwedToMinor;

  // =========================================================================
  // SHEET 1: ملخص الحساب (Direct Only)
  // =========================================================================
  const summaryCols: TableColumnSpec[] = [
    { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
    { header: 'القيمة', align: 'left', type: 'currency', semanticColor: true, minWidth: 22 },
    { header: 'التوضيح', align: 'right', type: 'text', minWidth: 34 },
  ];

  const summarySheet = workbook.addWorksheet('ملخص الحساب');
  applyBannerAndMeta(summarySheet, 3, `كشف الحساب المباشر: ${account.name}`, metaLine);
  const sHeader = summarySheet.getRow(4);
  sHeader.values = summaryCols.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(sHeader, 3);

  const summaryItems: Array<{ label: string; value: string | number; note: string; type: TableColumnSpec['type']; semantic?: boolean }> = [
    { label: 'اسم الحساب', value: account.name, note: `التصنيف: ${categoryName}`, type: 'text' },
    { label: 'المسار الهرمي', value: accountPath, note: 'نطاق هذا الكشف: مباشر للحساب فقط (دون الفروع)', type: 'text' },
    { label: 'حالة الحساب', value: account.status === 'active' ? 'نشط' : 'مؤرشف', note: 'حالة القيد الأساسية', type: 'text' },
    { label: 'الفترة الزمنية', value: periodLabel, note: `تاريخ التصدير: ${exportDateStr}`, type: 'text' },
    { label: 'عدد الحركات المباشرة بالفترة', value: statement.rows.length, note: 'حركات الحساب نفسه فقط', type: 'integer' },
    { label: `الرصيد الافتتاحي الأصلي (${currencySymbol})`, value: account.openingBalanceMinor / 100, note: 'الرصيد التأسيسي المسجل للحساب', type: 'currency', semantic: true },
    { label: `رصيد أول الفترة (${currencySymbol})`, value: statement.openingBalanceMinor / 100, note: fromDate ? `الرصيد الفعلي كما في بداية ${fromDate}` : 'الرصيد في بداية المدة', type: 'currency', semantic: true },
    { label: `إجمالي عليه المباشر (${currencySymbol})`, value: statement.totalOwedByMinor / 100, note: 'مجموع حركات (عليه) المباشرة خلال الفترة', type: 'currency', semantic: true },
    { label: `إجمالي له المباشر (${currencySymbol})`, value: statement.totalOwedToMinor / 100, note: 'مجموع حركات (له) المباشرة خلال الفترة', type: 'currency' },
    { label: `صافي حركة الفترة (${currencySymbol})`, value: netPeriodMinor / 100, note: 'الفرق: (عليه - له) خلال الفترة', type: 'currency', semantic: true },
    { label: `رصيد آخر الفترة المباشر (${currencySymbol})`, value: statement.closingBalanceMinor / 100, note: 'رصيد أول الفترة + صافي حركة الفترة', type: 'currency', semantic: true },
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
  finalizeSheetLayout(summarySheet, 4, 4 + summaryItems.length, summaryCols, false);

  // =========================================================================
  // SHEET 2: الحركات (Added ONLY if direct movements exist)
  // =========================================================================
  if (statement.rows.length > 0) {
    const movCols: TableColumnSpec[] = [
      { header: '#', align: 'center', type: 'integer', minWidth: 8 },
      { header: 'التاريخ', align: 'center', type: 'date', minWidth: 13 },
      { header: 'نوع الحركة', align: 'center', type: 'text', minWidth: 14 },
      { header: 'البيان', align: 'right', type: 'text', minWidth: 32 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `صافي الأثر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `الرصيد بعد الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 19 },
    ];

    const movRows = statement.rows.map((r, idx) => {
      const isOwedBy = r.transaction.entryType === 'owedByAccount';
      const signed = getSignedTransactionMinor(r.transaction.entryType, r.transaction.amountMinor);
      return {
        values: [
          idx + 1,
          r.transaction.date,
          isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)',
          r.transaction.description,
          isOwedBy ? r.transaction.amountMinor / 100 : 0,
          !isOwedBy ? r.transaction.amountMinor / 100 : 0,
          signed / 100,
          r.runningBalanceMinor / 100,
        ],
      };
    });

    createStyledTableSheet(
      workbook,
      'الحركات',
      `سجل الحركات المباشرة: ${account.name}`,
      metaLine,
      movCols,
      movRows,
      [
        '',
        'الإجمالي',
        `${statement.rows.length} حركة`,
        '',
        statement.totalOwedByMinor / 100,
        statement.totalOwedToMinor / 100,
        netPeriodMinor / 100,
        statement.closingBalanceMinor / 100,
      ],
      true
    );
  }

  // =========================================================================
  // SHEET 3: الأرصدة (Direct Account Summary Row Only)
  // =========================================================================
  const balCols: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 24 },
    { header: 'التصنيف', align: 'right', type: 'text', minWidth: 16 },
    { header: `الافتتاحي الأصلي (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `رصيد أول الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `عليه بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `له بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `صافي الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
    { header: `رصيد آخر الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 18 },
    { header: 'نوع الرصيد', align: 'center', type: 'text', minWidth: 16 },
  ];

  const bType =
    statement.closingBalanceMinor > 0 ? 'receivable' : statement.closingBalanceMinor < 0 ? 'payable' : 'balanced';

  createStyledTableSheet(
    workbook,
    'الأرصدة',
    `ملخص الرصيد المباشر: ${account.name}`,
    metaLine,
    balCols,
    [
      {
        values: [
          account.name,
          categoryName,
          account.openingBalanceMinor / 100,
          statement.openingBalanceMinor / 100,
          statement.totalOwedByMinor / 100,
          statement.totalOwedToMinor / 100,
          netPeriodMinor / 100,
          statement.closingBalanceMinor / 100,
          getBalanceTypeLabel(bType),
        ],
      },
    ],
    undefined,
    true
  );

  return workbook;
}

/**
 * Builds Consolidated Parent Account Workbook (Mode === 'consolidated'):
 * 1. ملخص الحساب
 * 2. الفروع (added only if scoped descendants exist)
 * 3. الحركات المجمعة (added only if movements exist)
 * 4. الأرصدة
 */
export function createConsolidatedParentAccountWorkbook(
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
    statusScope = 'all',
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RAKAN BALANCE';
  workbook.created = new Date();

  const consolidated = calculateConsolidatedStatement(
    accountId,
    accounts,
    transactions,
    fromDate,
    toDate,
    statusScope
  );

  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const rootCategory = categoryMap.get(consolidated.rootAccount.categoryId) || 'غير مصنف';
  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'كامل المدة';
  const exportDateStr = new Date().toISOString().slice(0, 10);
  const currencyLabel = currencyName ? `${currencyName} (${currencySymbol})` : currencySymbol;
  const metaLine = `الحساب المجمع: ${consolidated.rootAccount.name}  |  المالك: ${ownerName}  |  العملة: ${currencyLabel}  |  الفترة: ${periodLabel}  |  التصدير: ${exportDateStr}`;

  const directKidsCount = consolidated.branchBreakdown.filter(
    (b) => b.account.parentId === accountId
  ).length;
  const rootPath = consolidated.branchBreakdown[0]?.hierarchicalPath || consolidated.rootAccount.name;

  // =========================================================================
  // SHEET 1: ملخص الحساب
  // =========================================================================
  const summaryCols: TableColumnSpec[] = [
    { header: 'البيان', align: 'right', type: 'text', minWidth: 30 },
    { header: 'القيمة', align: 'left', type: 'currency', semanticColor: true, minWidth: 22 },
    { header: 'التوضيح', align: 'right', type: 'text', minWidth: 36 },
  ];

  const summarySheet = workbook.addWorksheet('ملخص الحساب');
  applyBannerAndMeta(summarySheet, 3, `كشف الحساب المجمع: ${consolidated.rootAccount.name}`, metaLine);
  const sHeader = summarySheet.getRow(4);
  sHeader.values = summaryCols.map((c) => sanitizeCellString(c.header));
  styleTableHeaderRow(sHeader, 3);

  const summaryItems: Array<{ label: string; value: string | number; note: string; type: TableColumnSpec['type']; semantic?: boolean; consolidated?: boolean }> = [
    { label: 'اسم الحساب الرئيسي', value: consolidated.rootAccount.name, note: `التصنيف: ${rootCategory}`, type: 'text' },
    { label: 'المسار الهرمي', value: rootPath, note: 'الموقع في شجرة الحسابات', type: 'text' },
    { label: 'عدد الأبناء المباشرين', value: directKidsCount, note: 'الفروع المرتبطة مباشرة بهذا الحساب', type: 'integer' },
    { label: 'إجمالي التابعين في الشجرة', value: consolidated.descendantCount, note: 'جميع الفروع والأحفاد على كافة المستويات', type: 'integer' },
    { label: 'الفترة الزمنية', value: periodLabel, note: `تاريخ التصدير: ${exportDateStr}`, type: 'text' },
    { label: 'عدد الحركات المجمعة بالفترة', value: consolidated.rows.length, note: 'حركات الحساب الرئيسي مع جميع التابعين', type: 'integer' },
    { label: `رصيد أول الفترة المجمع (${currencySymbol})`, value: consolidated.openingConsolidatedBalanceMinor / 100, note: 'رصيد أول المدة الفعلي للشجرة', type: 'currency', consolidated: true },
    { label: `إجمالي عليه المجمع (${currencySymbol})`, value: consolidated.totalOwedByMinor / 100, note: 'مجموع حركات (عليه) للشجرة خلال الفترة', type: 'currency', semantic: true },
    { label: `إجمالي له المجمع (${currencySymbol})`, value: consolidated.totalOwedToMinor / 100, note: 'مجموع حركات (له) للشجرة خلال الفترة', type: 'currency' },
    { label: `صافي حركة الفترة المجمعة (${currencySymbol})`, value: consolidated.netPeriodMovementMinor / 100, note: 'الفرق المجمع: (عليه - له)', type: 'currency', semantic: true },
    { label: `الرصيد المباشر للحساب (${currencySymbol})`, value: consolidated.directBalanceMinor / 100, note: 'رصيد الحساب نفسه فقط دون الفروع', type: 'currency', semantic: true },
    { label: `مجموع أرصدة التابعين (${currencySymbol})`, value: consolidated.descendantsDirectSumMinor / 100, note: 'مجموع الأرصدة المباشرة لكافة الفروع والأحفاد', type: 'currency', semantic: true },
    { label: `الرصيد المجمع الختامي (${currencySymbol})`, value: consolidated.closingConsolidatedBalanceMinor / 100, note: 'رصيد أول الفترة المجمع + صافي حركة الفترة', type: 'currency', consolidated: true },
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
          ? {
              header: 'القيمة',
              align: typeof item.value === 'number' ? 'left' : 'right',
              type: item.type,
              semanticColor: item.semantic,
              consolidatedAccent: item.consolidated,
            }
          : summaryCols[c - 1];
      styleDataCell(row.getCell(c), spec, idx);
    }
  });
  finalizeSheetLayout(summarySheet, 4, 4 + summaryItems.length, summaryCols, false);

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
      { header: `رصيد أول الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 16 },
      { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', consolidatedAccent: true, minWidth: 16 },
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
        b.openingAtPeriodMinor / 100,
        b.periodOwedByMinor / 100,
        b.periodOwedToMinor / 100,
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
      branchRows,
      undefined,
      true
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
      { header: 'نوع الحركة', align: 'center', type: 'text', minWidth: 14 },
      { header: 'البيان', align: 'right', type: 'text', minWidth: 28 },
      { header: `عليه (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `له (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 14 },
      { header: `صافي الأثر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 15 },
      { header: `الرصيد الجاري المجمع (${currencySymbol})`, align: 'left', type: 'currency', consolidatedAccent: true, minWidth: 19 },
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
          isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)',
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
        '',
        consolidated.totalOwedByMinor / 100,
        consolidated.totalOwedToMinor / 100,
        consolidated.netPeriodMovementMinor / 100,
        consolidated.closingConsolidatedBalanceMinor / 100,
        '',
      ],
      true
    );
  }

  // =========================================================================
  // SHEET 4: الأرصدة (Subtree Direct vs Consolidated Balances)
  // =========================================================================
  const balCols: TableColumnSpec[] = [
    { header: 'الحساب', align: 'right', type: 'text', minWidth: 24 },
    { header: 'المستوى', align: 'center', type: 'integer', minWidth: 10 },
    { header: 'المسار الهرمي', align: 'right', type: 'text', minWidth: 28 },
    { header: `رصيد أول الفترة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `عليه بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `له بالفترة (${currencySymbol})`, align: 'left', type: 'currency', minWidth: 15 },
    { header: `صافي الحركة (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 15 },
    { header: `الرصيد المباشر (${currencySymbol})`, align: 'left', type: 'currency', semanticColor: true, minWidth: 17 },
    { header: `الرصيد المجمع (${currencySymbol})`, align: 'left', type: 'currency', consolidatedAccent: true, minWidth: 17 },
    { header: 'نوع الرصيد المجمع', align: 'center', type: 'text', minWidth: 16 },
  ];

  const rootLvl = consolidated.branchBreakdown[0]?.level ?? 0;
  let totalOpeningDirect = 0;
  let totalPeriodOwedBy = 0;
  let totalPeriodOwedTo = 0;
  let totalPeriodNet = 0;
  let totalDirect = 0;

  const balRows = consolidated.branchBreakdown.map((b) => {
    totalOpeningDirect += b.openingAtPeriodMinor;
    totalPeriodOwedBy += b.periodOwedByMinor;
    totalPeriodOwedTo += b.periodOwedToMinor;
    totalPeriodNet += b.periodNetMovementMinor;
    totalDirect += b.directBalanceMinor;
    const cType = b.consolidatedBalanceMinor > 0 ? 'receivable' : b.consolidatedBalanceMinor < 0 ? 'payable' : 'balanced';
    return {
      values: [
        b.account.name,
        b.level,
        b.hierarchicalPath,
        b.openingAtPeriodMinor / 100,
        b.periodOwedByMinor / 100,
        b.periodOwedToMinor / 100,
        b.periodNetMovementMinor / 100,
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
      totalPeriodNet / 100,
      totalDirect / 100,
      consolidated.closingConsolidatedBalanceMinor / 100,
      consolidated.closingConsolidatedBalanceMinor > 0
        ? 'صافي لك'
        : consolidated.closingConsolidatedBalanceMinor < 0
        ? 'صافي عليك'
        : 'متزن',
    ],
    true
  );

  return workbook;
}

/**
 * Backward-compatible alias for Consolidated Parent Workbook
 */
export function createSingleParentAccountWorkbook(
  params: SingleParentExcelParams
): ExcelJS.Workbook {
  return createConsolidatedParentAccountWorkbook(params);
}

/**
 * Exports Direct-Only Account Statement to Excel (.xlsx)
 */
export async function exportDirectAccountToExcel(
  params: SingleParentExcelParams
): Promise<void> {
  const workbook = createDirectAccountWorkbook(params);
  const accName = params.accounts.find((a) => a.id === params.accountId)?.name || 'Account';
  await downloadWorkbook(workbook, `Rakan_Balance_${accName}_Direct`);
}

/**
 * Exports Consolidated Parent Account Statement to Excel (.xlsx)
 */
export async function exportConsolidatedParentAccountToExcel(
  params: SingleParentExcelParams
): Promise<void> {
  const workbook = createConsolidatedParentAccountWorkbook(params);
  const accName = params.accounts.find((a) => a.id === params.accountId)?.name || 'Account';
  await downloadWorkbook(workbook, `Rakan_Balance_${accName}_Consolidated`);
}

/**
 * Backward-compatible alias for Consolidated Parent Excel Export
 */
export async function exportSingleParentAccountToExcel(
  params: SingleParentExcelParams
): Promise<void> {
  await exportConsolidatedParentAccountToExcel(params);
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
 * Uses comprehensive multi-sheet workbook when full context is passed.
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
    ],
    true
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
    ],
    true
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
    ],
    true
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
      ],
      true
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
      ],
      true
    );
  }

  await downloadWorkbook(workbook, 'Rakan_Balance_Debtors_Creditors');
}
