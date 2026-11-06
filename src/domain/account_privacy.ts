/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE — explicitly public account search and financial statement CSV.
 * AccountModel.notes is private: never include it in public search or financial exports.
 */

import type { AccountModel } from './types.ts';
import type { calculateAccountStatement } from './balance_calculator.ts';

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
  csv += `كشف حساب: ${account.name}\n`;
  csv += 'العملة: SAR (ر.س)\n';
  csv += `الفترة: ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}\n`;
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
    const quotedDescription = `"${description.replace(/"/g, '""')}"`;
    csv += `${index + 1},${row.transaction.date},${quotedDescription},${owedByAmount},${owedToAmount},${balance}\n`;
  });

  csv += `\nإجمالي عليه خلال الفترة: ${(statement.totalOwedByMinor / 100).toFixed(2)}\n`;
  csv += `إجمالي له خلال الفترة: ${(statement.totalOwedToMinor / 100).toFixed(2)}\n`;
  csv += `رصيد آخر المدة: ${(statement.closingBalanceMinor / 100).toFixed(2)}\n`;
  return csv;
}
