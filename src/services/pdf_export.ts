/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Secure Arabic Native DOM Print / PDF Export Service
 * Features HTML Injection Protection, reliable print trigger window/iframe fallback, and multi-page layout.
 */

export interface MetricCardConfig {
  title: string;
  value: string;
  subtext?: string;
  colorClass?: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple' | 'slate';
}

export interface TableColumnConfig {
  header: string;
  align?: 'right' | 'center' | 'left';
}

export interface PrintableReportConfig {
  reportTitle: string;
  subtitle?: string;
  ownerName: string;
  currencySymbol: string;
  filterInfo?: string;
  metrics?: MetricCardConfig[];
  columns: TableColumnConfig[];
  rows: (string | number)[][];
  footerNote?: string;
}

/**
 * HTML Sanitization Helper to prevent HTML / Script Injection Attacks
 * Encodes special characters without altering Arabic text.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getPdfReportHtml(config: PrintableReportConfig): string {
  const generatedAt = new Date().toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const safeTitle = escapeHtml(config.reportTitle);
  const safeSubtitle = config.subtitle ? escapeHtml(config.subtitle) : '';
  const safeOwner = escapeHtml(config.ownerName);
  const safeCurrency = escapeHtml(config.currencySymbol);
  const safeFilter = config.filterInfo ? escapeHtml(config.filterInfo) : '';
  const safeFooter = config.footerNote
    ? escapeHtml(config.footerNote)
    : 'تم التصدير بواسطة منصة RAKAN BALANCE للويب — تطبيق محاسبي آمن ومحلي 100%';

  const colorMap = {
    emerald: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
    rose: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
    amber: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    purple: { bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' },
    slate: { bg: '#f8fafc', text: '#334155', border: '#e2e8f0' },
  };

  const metricsHtml = config.metrics && config.metrics.length > 0
    ? `
      <div style="display: grid; grid-template-columns: repeat(${Math.min(config.metrics.length, 4)}, 1fr); gap: 12px; margin-bottom: 20px;">
        ${config.metrics.map((m) => {
          const colors = colorMap[m.colorClass || 'slate'];
          return `
            <div style="background-color: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 10px 14px;">
              <div style="font-size: 11px; font-weight: 600; color: ${colors.text}; margin-bottom: 4px;">${escapeHtml(m.title)}</div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; direction: ltr; text-align: right;">${escapeHtml(m.value)}</div>
              ${m.subtext ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${escapeHtml(m.subtext)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `
    : '';

  const tableHeadersHtml = config.columns
    .map((col) => `<th style="padding: 10px 12px; background-color: #f1f5f9; color: #334155; font-weight: 700; font-size: 11px; text-align: ${col.align || 'right'}; border-bottom: 2px solid #cbd5e1;">${escapeHtml(col.header)}</th>`)
    .join('');

  const tableRowsHtml = config.rows
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const cells = row
        .map((cell, cIdx) => {
          const align = config.columns[cIdx]?.align || 'right';
          return `<td style="padding: 8px 12px; font-size: 11px; color: #1e293b; border-bottom: 1px solid #e2e8f0; text-align: ${align};">${escapeHtml(cell)}</td>`;
        })
        .join('');
      return `<tr style="background-color: ${bg}; page-break-inside: avoid;">${cells}</tr>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${safeTitle} — راكان بلانس</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm 10mm 15mm 10mm;
        }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #0f172a;
          background: #ffffff;
          direction: rtl;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 2px solid #059669;
          margin-bottom: 16px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .brand-logo {
          width: 36px;
          height: 36px;
          background-color: #059669;
          color: #ffffff;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
        }
        .brand-title {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        .brand-sub {
          font-size: 10px;
          color: #64748b;
          font-family: monospace;
        }
        .meta-box {
          text-align: left;
          font-size: 10px;
          color: #475569;
        }
        .report-title-section {
          margin-bottom: 16px;
        }
        .report-title {
          font-size: 18px;
          font-weight: 800;
          color: #047857;
          margin: 0 0 4px 0;
        }
        .report-sub {
          font-size: 11px;
          color: #64748b;
          margin: 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        thead {
          display: table-header-group;
        }
        tr {
          page-break-inside: avoid;
        }
        .footer {
          margin-top: 24px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <div class="brand-logo">ر</div>
          <div>
            <div class="brand-title">راكان بلانس | RAKAN BALANCE</div>
            <div class="brand-sub">Financial Management System</div>
          </div>
        </div>
        <div class="meta-box">
          <div><strong>المالك:</strong> ${safeOwner}</div>
          <div><strong>العملة الموحدة:</strong> ${safeCurrency}</div>
          <div><strong>تاريخ التصدير:</strong> ${generatedAt}</div>
        </div>
      </div>

      <div class="report-title-section">
        <h1 class="report-title">${safeTitle}</h1>
        ${safeSubtitle ? `<p class="report-sub">${safeSubtitle}</p>` : ''}
        ${safeFilter ? `<div style="font-size: 10px; color: #047857; margin-top: 4px; font-weight: 600;">تصفية: ${safeFilter}</div>` : ''}
      </div>

      ${metricsHtml}

      <table>
        <thead>
          <tr>${tableHeadersHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="footer">
        <div>${safeFooter}</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Reliable PDF / Native Print Trigger
 * Attempts window popup print first, falls back to iframe if popups are restricted.
 */
export function generatePdfReport(config: PrintableReportConfig): void {
  const htmlDocument = getPdfReportHtml(config);

  // Attempt 1: Open popup window (most reliable across browsers for print dialog)
  let printWin: Window | null = null;
  try {
    printWin = window.open('', '_blank', 'width=900,height=800,scrollbars=yes,resizable=yes');
  } catch (err) {
    printWin = null;
  }

  if (printWin && !printWin.closed) {
    try {
      printWin.document.open();
      printWin.document.write(htmlDocument);
      printWin.document.close();

      const triggerPrint = () => {
        try {
          printWin?.focus();
          printWin?.print();
        } catch (e) {
          console.error('Print window error:', e);
        }
      };

      if (printWin.document.readyState === 'complete') {
        setTimeout(triggerPrint, 200);
      } else {
        printWin.onload = triggerPrint;
        setTimeout(triggerPrint, 500); // Fallback trigger
      }
      return;
    } catch (e) {
      console.warn('Popup write failed, falling back to iframe print...', e);
    }
  }

  // Attempt 2: Fallback to document iframe if popup was blocked
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('title', 'Print Document');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    alert('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة من إعدادات المتصفح.');
    return;
  }

  doc.open();
  doc.write(htmlDocument);
  doc.close();

  const triggerIframePrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      alert('تعذر استدعاء أمر الطباعة في هذا المتصفح.');
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 5000); // Keep iframe alive long enough for print dialog
    }
  };

  if (iframe.contentWindow) {
    iframe.contentWindow.onload = triggerIframePrint;
    setTimeout(triggerIframePrint, 500);
  }
}

import type {
  AccountsBalanceReport,
  CategorySummaryReport,
  DebtorsCreditorsReport,
  NormalizedReportScope,
  PeriodSummaryReport,
} from '../domain/financial_reports.ts';
import type {
  HierarchicalAccountsReport,
  ParentAccountPeriodReport,
} from '../domain/hierarchical_accounts.ts';
import { formatCurrency } from '../domain/money.ts';

function formatScopeSummaryLine(scope: NormalizedReportScope): string {
  const periodStr =
    scope.fromDate || scope.toDate
      ? `الفترة: ${scope.fromDate || 'البداية'} إلى ${scope.toDate || 'اليوم'}`
      : 'الفترة: جميع الفترات';
  const statusStr =
    scope.status === 'active'
      ? 'الحالة: نشطة'
      : scope.status === 'archived'
      ? 'الحالة: مؤرشفة'
      : 'الحالة: الكل';
  return `${periodStr}  |  ${statusStr}`;
}

export function buildAccountsReportPdfConfig(
  report: AccountsBalanceReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  return {
    reportTitle: 'تقرير أرصدة الحسابات والأطراف',
    subtitle: `الحسابات المشمولة: ${report.totalScopedAccountsCount} | المستبعدة (خاملة): ${report.excludedDormantCount}`,
    ownerName,
    currencySymbol,
    filterInfo: formatScopeSummaryLine(report.appliedScope),
    metrics: [
      { title: 'إجمالي لك', value: formatCurrency(report.totalReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي عليك', value: formatCurrency(report.totalPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'الصافي', value: formatCurrency(report.netBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
      { title: 'عدد الحسابات ذات الصلة', value: String(report.totalScopedAccountsCount), colorClass: 'slate' },
    ],
    columns: [
      { header: 'الحساب', align: 'right' },
      { header: 'التصنيف', align: 'right' },
      { header: `رصيد أول الفترة (${currencySymbol})`, align: 'right' },
      { header: `عليه (${currencySymbol})`, align: 'right' },
      { header: `له (${currencySymbol})`, align: 'right' },
      { header: `صافي الحركة (${currencySymbol})`, align: 'right' },
      { header: `رصيد آخر الفترة (${currencySymbol})`, align: 'right' },
      { header: 'الحالة', align: 'center' },
    ],
    rows: report.rows.map((r) => [
      r.hierarchicalPath !== r.account.name ? `${r.account.name} (${r.hierarchicalPath})` : r.account.name,
      r.categoryName,
      formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol }),
      formatCurrency(r.totalOwedByMinor, { symbol: currencySymbol }),
      formatCurrency(r.totalOwedToMinor, { symbol: currencySymbol }),
      formatCurrency(r.netMovementMinor, { symbol: currencySymbol }),
      formatCurrency(r.currentBalanceMinor, { symbol: currencySymbol }),
      r.balanceType === 'receivable' ? 'لك' : r.balanceType === 'payable' ? 'عليك' : 'متزن',
    ]),
  };
}

export function buildHierarchicalReportPdfConfig(
  report: HierarchicalAccountsReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  return {
    reportTitle: 'التقرير التنفيذي للحسابات الرئيسية والفروع',
    subtitle: `الحسابات الفعالة: ${report.totalScopedAccountsCount} | المستبعدة (خاملة): ${report.excludedDormantCount}`,
    ownerName,
    currencySymbol,
    filterInfo: formatScopeSummaryLine(report.appliedScope),
    metrics: [
      { title: 'إجمالي لك (مباشر)', value: formatCurrency(report.totalDirectReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي عليك (مباشر)', value: formatCurrency(report.totalDirectPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'رصيد أول الفترة', value: formatCurrency(report.totalOpeningAtPeriodMinor, { symbol: currencySymbol }), colorClass: 'slate' },
      { title: 'رصيد آخر الفترة', value: formatCurrency(report.totalClosingDirectBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
    ],
    columns: [
      { header: 'الحساب', align: 'right' },
      { header: 'المسار / المستوى', align: 'right' },
      { header: `رصيد أول الفترة (${currencySymbol})`, align: 'right' },
      { header: `عليه (${currencySymbol})`, align: 'right' },
      { header: `له (${currencySymbol})`, align: 'right' },
      { header: `صافي الحركة (${currencySymbol})`, align: 'right' },
      { header: `الرصيد المباشر (${currencySymbol})`, align: 'right' },
      { header: `رصيد التابعين (${currencySymbol})`, align: 'right' },
      { header: `الرصيد المجمع (${currencySymbol})`, align: 'right' },
      { header: 'الحالة', align: 'center' },
    ],
    rows: report.rows.map((r) => [
      `${'— '.repeat(r.level)}${r.account.name}`,
      `${r.hierarchicalPath} (م${r.level})`,
      formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol }),
      formatCurrency(r.directOwedByMinor, { symbol: currencySymbol }),
      formatCurrency(r.directOwedToMinor, { symbol: currencySymbol }),
      formatCurrency(r.directNetMovementMinor, { symbol: currencySymbol }),
      formatCurrency(r.directBalanceMinor, { symbol: currencySymbol }),
      formatCurrency(r.consolidatedChildrenOnlyMinor, { symbol: currencySymbol }),
      formatCurrency(r.consolidatedBalanceMinor, { symbol: currencySymbol }),
      r.account.status === 'active' ? 'نشط' : 'مؤرشف',
    ]),
  };
}

export function buildCategoriesReportPdfConfig(
  report: CategorySummaryReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  return {
    reportTitle: 'تقرير توزيع الأرصدة حسب التصنيفات',
    subtitle: `عدد التصنيفات: ${report.rows.length} | الحسابات المشمولة: ${report.includedAccountsCount} | المستبعدة: ${report.excludedDormantCount}`,
    ownerName,
    currencySymbol,
    filterInfo: formatScopeSummaryLine(report.appliedScope),
    metrics: [
      { title: 'إجمالي لك بالتصنيفات', value: formatCurrency(report.grandTotalReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي عليك بالتصنيفات', value: formatCurrency(report.grandTotalPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'الصافي العام', value: formatCurrency(report.grandNetBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
      { title: 'الحسابات المشمولة', value: String(report.includedAccountsCount), colorClass: 'slate' },
    ],
    columns: [
      { header: 'اسم التصنيف', align: 'right' },
      { header: 'عدد الحسابات المشمولة', align: 'center' },
      { header: `إجمالي لك (${currencySymbol})`, align: 'right' },
      { header: `إجمالي عليك (${currencySymbol})`, align: 'right' },
      { header: `الصافي (${currencySymbol})`, align: 'right' },
    ],
    rows: report.rows.map((r) => [
      r.category.name,
      r.accountsCount,
      formatCurrency(r.totalReceivableMinor, { symbol: currencySymbol }),
      formatCurrency(r.totalPayableMinor, { symbol: currencySymbol }),
      formatCurrency(r.netBalanceMinor, { symbol: currencySymbol }),
    ]),
  };
}

export function buildPeriodReportPdfConfig(
  report: PeriodSummaryReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  return {
    reportTitle: 'تقرير حركة الحسابات التفصيلي للفترة',
    subtitle: `عدد الحركات المالي: ${report.transactionsCount} | الحسابات المشمولة: ${report.includedAccountsCount}`,
    ownerName,
    currencySymbol,
    filterInfo: formatScopeSummaryLine(report.appliedScope),
    metrics: [
      { title: 'الرصيد الافتتاحي السابق', value: formatCurrency(report.openingBalanceMinor, { symbol: currencySymbol }), colorClass: 'slate' },
      { title: 'إجمالي عليه بالفترة', value: formatCurrency(report.totalOwedByMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي له بالفترة', value: formatCurrency(report.totalOwedToMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'الرصيد الختامي الإجمالي', value: formatCurrency(report.closingBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
    ],
    columns: [
      { header: 'التاريخ', align: 'center' },
      { header: 'الحساب', align: 'right' },
      { header: 'التصنيف', align: 'right' },
      { header: 'نوع الحركة', align: 'center' },
      { header: 'البيان', align: 'right' },
      { header: `المبلغ (${currencySymbol})`, align: 'right' },
    ],
    rows: report.rows.map((r) => [
      r.transaction.date,
      r.accountName,
      r.categoryName,
      r.transaction.entryType === 'owedByAccount' ? 'عليه' : 'له',
      r.transaction.description,
      formatCurrency(r.transaction.amountMinor, { symbol: currencySymbol }),
    ]),
  };
}

export function buildDebtorsCreditorsReportPdfConfig(
  report: DebtorsCreditorsReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  return {
    reportTitle: 'تقرير تحليل الأطراف والتركز المالي (لك / عليك)',
    subtitle: `عدد المدينين: ${report.totalDebtorsCount} | عدد الدائنين: ${report.totalCreditorsCount}`,
    ownerName,
    currencySymbol,
    filterInfo: report.appliedScope.toDate
      ? `حتى تاريخ: ${report.appliedScope.toDate} | ${report.appliedScope.status === 'active' ? 'نشطة' : report.appliedScope.status === 'archived' ? 'مؤرشفة' : 'الكل'}`
      : `كامل التاريخ | ${report.appliedScope.status === 'active' ? 'نشطة' : report.appliedScope.status === 'archived' ? 'مؤرشفة' : 'الكل'}`,
    metrics: [
      { title: 'إجمالي حقوقك (لك)', value: formatCurrency(report.totalDebtorsMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'أعلى مدين', value: report.topDebtorName || 'لا يوجد', subtext: formatCurrency(report.topDebtorAmountMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي التزاماتك (عليك)', value: formatCurrency(report.totalCreditorsMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'أعلى دائن', value: report.topCreditorName || 'لا يوجد', subtext: formatCurrency(report.topCreditorAmountMinor, { symbol: currencySymbol }), colorClass: 'rose' },
    ],
    columns: [
      { header: 'اسم الحساب', align: 'right' },
      { header: 'التصنيف', align: 'right' },
      { header: 'النوع', align: 'center' },
      { header: `المبلغ (${currencySymbol})`, align: 'right' },
      { header: 'نسبة التركز', align: 'center' },
    ],
    rows: [
      ...report.debtors.map((d) => [
        d.account.name,
        d.categoryName,
        'مدين (لك)',
        formatCurrency(d.balanceMinor, { symbol: currencySymbol }),
        `${d.sharePercentage.toFixed(1)}%`,
      ]),
      ...report.creditors.map((c) => [
        c.account.name,
        c.categoryName,
        'دائن (عليك)',
        formatCurrency(c.absBalanceMinor, { symbol: currencySymbol }),
        `${c.sharePercentage.toFixed(1)}%`,
      ]),
    ],
  };
}

export function buildParentAccountPeriodPdfConfig(
  report: ParentAccountPeriodReport,
  options: { ownerName: string; currencySymbol: string }
): PrintableReportConfig {
  const { ownerName, currencySymbol } = options;
  const rootName = report.rootAccount?.name || 'حساب رئيسي';
  const modeLabel = report.mode === 'summary' ? 'ملخص' : 'تفصيلي';
  const s = report.summary;

  return {
    reportTitle: `تقرير الحساب الرئيسي والفروع — ${rootName}`,
    subtitle: `الوضع: ${modeLabel} | الحسابات التابعة الفعالة: ${s.activeBranchesCount} | المستبعدة (خاملة): ${report.excludedDormantCount}`,
    ownerName,
    currencySymbol,
    filterInfo: formatScopeSummaryLine(report.appliedScope),
    metrics: [
      { title: 'رصيد أول الفترة', value: formatCurrency(s.openingAtPeriodMinor, { symbol: currencySymbol }), colorClass: 'slate' },
      { title: 'إجمالي عليه', value: formatCurrency(s.owedByMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
      { title: 'إجمالي له', value: formatCurrency(s.owedToMinor, { symbol: currencySymbol }), colorClass: 'rose' },
      { title: 'رصيد آخر الفترة', value: formatCurrency(s.closingBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
    ],
    columns: [
      { header: 'الحساب', align: 'right' },
      { header: 'نوع الحساب', align: 'center' },
      { header: 'التصنيف', align: 'right' },
      { header: `رصيد أول الفترة (${currencySymbol})`, align: 'right' },
      { header: `عليه خلال الفترة (${currencySymbol})`, align: 'right' },
      { header: `له خلال الفترة (${currencySymbol})`, align: 'right' },
      { header: `صافي حركة الفترة (${currencySymbol})`, align: 'right' },
      { header: `رصيد آخر الفترة (${currencySymbol})`, align: 'right' },
      { header: 'نوع الرصيد', align: 'center' },
    ],
    rows: report.allRows.map((r) => [
      `${r.level > 0 ? `${'— '.repeat(r.level)}` : ''}${r.displayName}`,
      r.accountTypeLabel,
      r.categoryName,
      formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol }),
      formatCurrency(r.owedByMinor, { symbol: currencySymbol }),
      formatCurrency(r.owedToMinor, { symbol: currencySymbol }),
      formatCurrency(r.netMovementMinor, { symbol: currencySymbol }),
      formatCurrency(r.closingBalanceMinor, { symbol: currencySymbol }),
      r.balanceTypeLabel,
    ]),
  };
}

