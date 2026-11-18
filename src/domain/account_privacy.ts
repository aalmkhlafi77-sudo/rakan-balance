/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE — explicitly public account search and financial statement CSV.
 * AccountModel.notes is private: never include it in public search or financial exports.
 */

import type { AccountModel } from './types.ts';
import type { calculateAccountStatement } from './balance_calculator.ts';

export function sanitizeSpreadsheetText(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const raw = String(val);
  if (/^[=+\-@\t\r]/.test(raw)) {
    return `'${raw.trim()}`;
  }
  const trimmed = raw.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

export function matchesPublicAccountSearch(account: AccountModel, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return account.name.toLowerCase().includes(normalized)
    || Boolean(account.phone?.toLowerCase().includes(normalized));
}

type Statement = ReturnType<typeof calculateAccountStatement>;

export function buildStatementCSV(
  account: AccountModel,
  allAccounts: AccountModel[],
  statement: Statement,
  fromDate?: string,
  toDate?: string
): string {
  let csv = '\uFEFF';
  csv += `كشف حساب: ${sanitizeSpreadsheetText(account.name)}\n`;
  csv += 'العملة: SAR (ر.س)\n';
  csv += `الفترة: ${sanitizeSpreadsheetText(fromDate || 'البداية')} إلى ${sanitizeSpreadsheetText(toDate || 'اليوم')}\n`;
  csv += `رصيد أول المدة: ${(statement.openingBalanceMinor / 100).toFixed(2)}\n\n`;
  csv += 'م,التاريخ,البيان,عليه (لك),له (عليك),الرصيد بعد الحركة\n';

  statement.rows.forEach((row, index) => {
    const owedBy = row.transaction.entryType === 'owedByAccount';
    const owedByAmount = owedBy ? (row.transaction.amountMinor / 100).toFixed(2) : '0.00';
    const owedToAmount = !owedBy ? (row.transaction.amountMinor / 100).toFixed(2) : '0.00';
    const balance = (row.runningBalanceMinor / 100).toFixed(2);
    let description = row.transaction.description;
    if (row.transaction.transferId && row.transaction.counterpartyAccountId) {
      const counterpart = allAccounts.find((item) => item.id === row.transaction.counterpartyAccountId);
      if (counterpart) {
        description += ` (${row.transaction.transferRole === 'source' ? 'نقل مديونية إلى: ' : 'مديونية محولة من: '}${counterpart.name})`;
      }
    }
    const safeDesc = sanitizeSpreadsheetText(description);
    const quotedDescription = `"${safeDesc.replace(/"/g, '""')}"`;
    const safeDate = sanitizeSpreadsheetText(row.transaction.date);
    csv += `${index + 1},${safeDate},${quotedDescription},${owedByAmount},${owedToAmount},${balance}\n`;
  });

  csv += `\nإجمالي عليه خلال الفترة: ${(statement.totalOwedByMinor / 100).toFixed(2)}\n`;
  csv += `إجمالي له خلال الفترة: ${(statement.totalOwedToMinor / 100).toFixed(2)}\n`;
  csv += `رصيد آخر المدة: ${(statement.closingBalanceMinor / 100).toFixed(2)}\n`;
  return csv;
}

export function buildConsolidatedStatementCSV(
  account: AccountModel,
  allAccounts: AccountModel[],
  consolidated: {
    openingConsolidatedBalanceMinor: number;
    closingConsolidatedBalanceMinor: number;
    totalOwedByMinor: number;
    totalOwedToMinor: number;
    descendantCount: number;
    rows: Array<{
      transaction: {
        entryType: 'owedByAccount' | 'owedToAccount';
        amountMinor: number;
        date: string;
        description: string;
        transferId?: string;
        transferRole?: 'source' | 'destination';
        counterpartyAccountId?: string;
      };
      sourceAccountName: string;
      hierarchicalPath: string;
      runningConsolidatedBalanceMinor: number;
    }>;
  },
  fromDate?: string,
  toDate?: string
): string {
  let csv = '\uFEFF';
  csv += `كشف حساب مجمع: ${sanitizeSpreadsheetText(account.name)} (يشمل ${consolidated.descendantCount} فروع وتوابع)\n`;
  csv += `الفترة: ${sanitizeSpreadsheetText(fromDate || 'البداية')} إلى ${sanitizeSpreadsheetText(toDate || 'اليوم')}\n`;
  csv += `رصيد أول المدة المجمع: ${(consolidated.openingConsolidatedBalanceMinor / 100).toFixed(2)}\n\n`;
  csv += 'م,التاريخ,الحساب المصدر,المسار الهرمي,البيان,عليه (لك),له (عليك),الرصيد المجمع بعد الحركة\n';

  consolidated.rows.forEach((row, index) => {
    const owedBy = row.transaction.entryType === 'owedByAccount';
    const owedByAmount = owedBy ? (row.transaction.amountMinor / 100).toFixed(2) : '0.00';
    const owedToAmount = !owedBy ? (row.transaction.amountMinor / 100).toFixed(2) : '0.00';
    const balance = (row.runningConsolidatedBalanceMinor / 100).toFixed(2);
    let description = row.transaction.description;
    if (row.transaction.transferId && row.transaction.counterpartyAccountId) {
      const counterpart = allAccounts.find((item) => item.id === row.transaction.counterpartyAccountId);
      if (counterpart) {
        description += ` (${row.transaction.transferRole === 'source' ? 'نقل مديونية إلى: ' : 'مديونية محولة من: '}${counterpart.name})`;
      }
    }
    const qSource = `"${sanitizeSpreadsheetText(row.sourceAccountName).replace(/"/g, '""')}"`;
    const qPath = `"${sanitizeSpreadsheetText(row.hierarchicalPath).replace(/"/g, '""')}"`;
    const qDesc = `"${sanitizeSpreadsheetText(description).replace(/"/g, '""')}"`;
    const safeDate = sanitizeSpreadsheetText(row.transaction.date);
    csv += `${index + 1},${safeDate},${qSource},${qPath},${qDesc},${owedByAmount},${owedToAmount},${balance}\n`;
  });

  csv += `\nإجمالي عليه المجمع خلال الفترة: ${(consolidated.totalOwedByMinor / 100).toFixed(2)}\n`;
  csv += `إجمالي له المجمع خلال الفترة: ${(consolidated.totalOwedToMinor / 100).toFixed(2)}\n`;
  csv += `رصيد آخر المدة المجمع: ${(consolidated.closingConsolidatedBalanceMinor / 100).toFixed(2)}\n`;
  return csv;
}


