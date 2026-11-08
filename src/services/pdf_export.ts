/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Arabic Native DOM Print / PDF Export Service
 * Renders RTL formatted PDF reports with clean header, metric cards, printable tables, and page footers.
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
 * Triggers native browser print formatted as PDF
 */
export function generatePdfReport(config: PrintableReportConfig): void {
  // Create an iframe to render clean printable HTML without modifying main document DOM
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    alert('تعذر فتح نافذة الطباعة');
    return;
  }

  const generatedAt = new Date().toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
      <div style="display: grid; grid-template-columns: repeat(${Math.min(config.metrics.length, 4)}, 1fr); gap: 12px; margin-bottom: 24px;">
        ${config.metrics.map((m) => {
          const colors = colorMap[m.colorClass || 'slate'];
          return `
            <div style="background-color: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 10px 14px;">
              <div style="font-size: 11px; font-weight: 600; color: ${colors.text}; margin-bottom: 4px;">${m.title}</div>
              <div style="font-size: 16px; font-weight: 700; color: #0f172a; direction: ltr; text-align: right;">${m.value}</div>
              ${m.subtext ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${m.subtext}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `
    : '';

  const tableHeadersHtml = config.columns
    .map((col) => `<th style="padding: 10px 12px; background-color: #f1f5f9; color: #334155; font-weight: 700; font-size: 11px; text-align: ${col.align || 'right'}; border-bottom: 2px solid #cbd5e1;">${col.header}</th>`)
    .join('');

  const tableRowsHtml = config.rows
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const cells = row
        .map((cell, cIdx) => {
          const align = config.columns[cIdx]?.align || 'right';
          return `<td style="padding: 8px 12px; font-size: 11px; color: #1e293b; border-bottom: 1px solid #e2e8f0; text-align: ${align};">${cell}</td>`;
        })
        .join('');
      return `<tr style="background-color: ${bg}; page-break-inside: avoid;">${cells}</tr>`;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${config.reportTitle} — راكان بلانس</title>
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
      <!-- Brand Header -->
      <div class="header">
        <div class="brand">
          <div class="brand-logo">ر</div>
          <div>
            <div class="brand-title">راكان بلانس | RAKAN BALANCE</div>
            <div class="brand-sub">Financial Management System</div>
          </div>
        </div>
        <div class="meta-box">
          <div><strong>المالك:</strong> ${config.ownerName}</div>
          <div><strong>العملة الموحدة:</strong> ${config.currencySymbol}</div>
          <div><strong>تاريخ التصدير:</strong> ${generatedAt}</div>
        </div>
      </div>

      <!-- Report Header -->
      <div class="report-title-section">
        <h1 class="report-title">${config.reportTitle}</h1>
        ${config.subtitle ? `<p class="report-sub">${config.subtitle}</p>` : ''}
        ${config.filterInfo ? `<div style="font-size: 10px; color: #047857; margin-top: 4px; font-weight: 600;">تصفية: ${config.filterInfo}</div>` : ''}
      </div>

      <!-- Summary Metrics Cards -->
      ${metricsHtml}

      <!-- Data Table -->
      <table>
        <thead>
          <tr>${tableHeadersHtml}</tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Document Footer -->
      <div class="footer">
        <div>${config.footerNote || 'تم التصدير بواسطة منصة RAKAN BALANCE للويب — تطبيق محاسبي آمن وحلي 100%'}</div>
        <div>صفحة 1 من 1</div>
      </div>
    </body>
    </html>
  `;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Allow styles and resources to compute before triggering print dialog
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1000);
  }, 300);
}
