/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Professional Excel Export Service (.xlsx)
 * Uses SheetJS to generate clean, formula-injection-safe Excel workbooks in RTL orientation.
 */

import * as XLSX from 'xlsx';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import { AccountBalanceReportRow, CategorySummaryReportRow, PartyRow, PeriodTransactionRow } from '../domain/financial_reports.ts';

/**
 * Sanitizes cell text to prevent Excel Formula Injection (=, +, -, @)
 */
function sanitizeCellString(val: unknown): string | number {
  if (typeof val === 'number') {
    return val;
  }
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`; // Prepend single quote so Excel treats it strictly as text string
  }
  return str;
}

/**
 * Common workbook trigger download
 */
function downloadWorkbook(wb: XLSX.WorkBook, baseFilename: string) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanName = baseFilename.replace(/[^\w\u0600-\u06FF\s-]/g, '_');
  const filename = `${cleanName}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export Accounts Balance Report to Excel
 */
export function exportAccountsReportToExcel(
  rows: AccountBalanceReportRow[],
  currencySymbol: string,
  summary: { totalReceivable: number; totalPayable: number; netBalance: number }
) {
  const headers = [
    'اسم الحساب',
    'التصنيف',
    `الرصيد الافتتاحي (${currencySymbol})`,
    `إجمالي عليه (${currencySymbol})`,
    `إجمالي له (${currencySymbol})`,
    `صافي الحركة (${currencySymbol})`,
    `الرصيد النهائي (${currencySymbol})`,
    'الحالة الحالية',
    'حالة الحساب',
  ];

  const dataRows: (string | number)[][] = rows.map((r) => [
    sanitizeCellString(r.account.name),
    sanitizeCellString(r.categoryName),
    r.openingBalanceMinor / 100,
    r.totalOwedByMinor / 100,
    r.totalOwedToMinor / 100,
    r.netMovementMinor / 100,
    r.currentBalanceMinor / 100,
    r.balanceType === 'receivable' ? 'لك (له رصيد)' : r.balanceType === 'payable' ? 'عليك (مطلوب)' : 'متزن',
    r.account.status === 'active' ? 'نشط' : 'مؤرشف',
  ]);

  // Add Summary row at bottom
  dataRows.push([]);
  dataRows.push([
    'الإجمالي العام',
    '',
    '',
    '',
    '',
    '',
    summary.netBalance / 100,
    `لك: ${formatCurrency(summary.totalReceivable, { symbol: currencySymbol })} | عليك: ${formatCurrency(summary.totalPayable, { symbol: currencySymbol })}`,
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws['!dir'] = 'rtl'; // Right to Left sheet orientation

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير الأرصدة الشامل');
  downloadWorkbook(wb, 'Rakan_Balance_Accounts_Report');
}

/**
 * Export Category Summary Report to Excel
 */
export function exportCategoriesReportToExcel(
  rows: CategorySummaryReportRow[],
  currencySymbol: string,
  grandTotals: { totalReceivable: number; totalPayable: number; grandNet: number }
) {
  const headers = [
    'اسم التصنيف',
    'عدد الحسابات النشطة',
    `إجمالي لك (${currencySymbol})`,
    `إجمالي عليك (${currencySymbol})`,
    `صافي المركز المالي (${currencySymbol})`,
  ];

  const dataRows: (string | number)[][] = rows.map((r) => [
    sanitizeCellString(r.category.name),
    r.accountsCount,
    r.totalReceivableMinor / 100,
    r.totalPayableMinor / 100,
    r.netBalanceMinor / 100,
  ]);

  dataRows.push([]);
  dataRows.push([
    'الإجمالي العام لجميع التصنيفات',
    rows.reduce((sum, r) => sum + r.accountsCount, 0),
    grandTotals.totalReceivable / 100,
    grandTotals.totalPayable / 100,
    grandTotals.grandNet / 100,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws['!dir'] = 'rtl';

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير التصنيفات');
  downloadWorkbook(wb, 'Rakan_Balance_Category_Summary');
}

/**
 * Export Period Summary Statement to Excel
 */
export function exportPeriodReportToExcel(
  rows: PeriodTransactionRow[],
  currencySymbol: string,
  meta: { fromDate?: string; toDate?: string; openingMinor: number; closingMinor: number }
) {
  const headers = [
    'التاريخ',
    'اسم الحساب',
    'التصنيف',
    'نوع الحركة',
    'البيان / الوصف',
    `المبلغ (${currencySymbol})`,
    `المبلغ الموقع (${currencySymbol})`,
    'الملاحظات',
  ];

  const dataRows: (string | number)[][] = rows.map((r) => [
    r.transaction.date,
    sanitizeCellString(r.accountName),
    sanitizeCellString(r.categoryName),
    r.transaction.entryType === 'owedByAccount' ? 'عليه (يزيد الدين)' : 'له (ينقص الدين)',
    sanitizeCellString(r.transaction.description),
    r.transaction.amountMinor / 100,
    r.signedAmountMinor / 100,
    sanitizeCellString(r.transaction.notes || ''),
  ]);

  // Header meta row
  const titleRow = [`تقرير الحركة للفترة: ${meta.fromDate || 'البداية'} إلى ${meta.toDate || 'اليوم'}`];
  const openingRow = [`الرصيد الافتتاحي الإجمالي قبل الفترة: ${formatCurrency(meta.openingMinor, { symbol: currencySymbol })}`];
  const closingRow = [`الرصيد الختامي الإجمالي في نهاية الفترة: ${formatCurrency(meta.closingMinor, { symbol: currencySymbol })}`];

  const fullContent = [
    titleRow,
    openingRow,
    closingRow,
    [],
    headers,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(fullContent);
  ws['!dir'] = 'rtl';

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'كشف الحركة الشامل');
  downloadWorkbook(wb, 'Rakan_Balance_Period_Statement');
}

/**
 * Export Debtors / Creditors Report to Excel
 */
export function exportDebtorsCreditorsReportToExcel(
  debtors: PartyRow[],
  creditors: PartyRow[],
  currencySymbol: string
) {
  const wb = XLSX.utils.book_new();

  // 1. Debtors Sheet (لك)
  const debtorHeaders = ['اسم الحساب (المدين)', 'التصنيف', `الرصيد لك (${currencySymbol})`, 'نسبة التركز (%)'];
  const debtorData = debtors.map((d) => [
    sanitizeCellString(d.account.name),
    sanitizeCellString(d.categoryName),
    d.balanceMinor / 100,
    Number(d.sharePercentage.toFixed(2)),
  ]);

  const wsDebtors = XLSX.utils.aoa_to_sheet([debtorHeaders, ...debtorData]);
  wsDebtors['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(wb, wsDebtors, 'المدينون (لك)');

  // 2. Creditors Sheet (عليك)
  const creditorHeaders = ['اسم الحساب (الدائن)', 'التصنيف', `المبلغ عليك (${currencySymbol})`, 'نسبة التركز (%)'];
  const creditorData = creditors.map((c) => [
    sanitizeCellString(c.account.name),
    sanitizeCellString(c.categoryName),
    c.absBalanceMinor / 100,
    Number(c.sharePercentage.toFixed(2)),
  ]);

  const wsCreditors = XLSX.utils.aoa_to_sheet([creditorHeaders, ...creditorData]);
  wsCreditors['!dir'] = 'rtl';
  XLSX.utils.book_append_sheet(wb, wsCreditors, 'الدائنون (عليك)');

  downloadWorkbook(wb, 'Rakan_Balance_Debtors_Creditors');
}
