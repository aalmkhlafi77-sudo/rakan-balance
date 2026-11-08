/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Financial Reports & Analytics Domain Engine
 * Follows Document v2 Sections 3, 4, 16 & WEB-F3 Specifications:
 * - Accounts Balance Report (Direct historical balances up to specified toDate, no double counting)
 * - Category Aggregation Report (Grouping accounts by category)
 * - Period Summary & Historical Statement Report (Historical opening & closing balances)
 * - Debtors / Creditors Analysis (لك vs عليك separation & concentration)
 */

import { AccountModel, CategoryModel, TransactionModel } from './types.ts';
import { compareTransactions, getSignedTransactionMinor } from './balance_calculator.ts';

/**
 * Filter options for financial reports
 */
export interface ReportFilterOptions {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  categoryId?: string; // 'all' or specific category ID
  status?: 'all' | 'active' | 'archived';
  searchQuery?: string;
}

/**
 * Accounts Balance Report Row
 */
export interface AccountBalanceReportRow {
  account: AccountModel;
  categoryName: string;
  openingBalanceMinor: number;
  totalOwedByMinor: number; // إجمالي عليه خلال الفترة
  totalOwedToMinor: number; // إجمالي له خلال الفترة
  netMovementMinor: number;
  currentBalanceMinor: number; // الرصيد الختامي التاريخي حتى نهاية الفترة المحددة
  balanceType: 'receivable' | 'payable' | 'balanced'; // لك (موجب) | عليك (سالب) | متزن (صفر)
}

/**
 * Accounts Balance Report Result
 */
export interface AccountsBalanceReport {
  rows: AccountBalanceReportRow[];
  totalReceivableMinor: number; // إجمالي لك
  totalPayableMinor: number; // إجمالي عليك
  netBalanceMinor: number; // صافي المركز المالي
  activeAccountsCount: number;
  archivedAccountsCount: number;
  balancedAccountsCount: number;
}

/**
 * Category Summary Report Row
 */
export interface CategorySummaryReportRow {
  category: CategoryModel;
  accountsCount: number;
  totalReceivableMinor: number; // لك في هذا التصنيف
  totalPayableMinor: number; // عليك في هذا التصنيف
  netBalanceMinor: number; // الصافي
}

/**
 * Category Summary Report Result
 */
export interface CategorySummaryReport {
  rows: CategorySummaryReportRow[];
  grandTotalReceivableMinor: number;
  grandTotalPayableMinor: number;
  grandNetBalanceMinor: number;
  totalCategoriesCount: number;
}

/**
 * Period Statement Report Row
 */
export interface PeriodTransactionRow {
  transaction: TransactionModel;
  accountName: string;
  categoryName: string;
  signedAmountMinor: number;
}

/**
 * Period Summary Report Result
 */
export interface PeriodSummaryReport {
  fromDate?: string;
  toDate?: string;
  openingBalanceMinor: number; // الرصيد الافتتاحي الإجمالي قبل بداية الفترة
  totalOwedByMinor: number; // إجمالي المقبوضات/عليه خلال الفترة
  totalOwedToMinor: number; // إجمالي المدفوعات/له خلال الفترة
  periodNetChangeMinor: number; // التغير الصافي خلال الفترة
  closingBalanceMinor: number; // الرصيد الختامي الإجمالي في نهاية الفترة
  transactionsCount: number;
  rows: PeriodTransactionRow[];
}

/**
 * Single Party (Debtor/Creditor) Entity
 */
export interface PartyRow {
  account: AccountModel;
  categoryName: string;
  balanceMinor: number; // Positive for debtor (لك), Negative for creditor (عليك)
  absBalanceMinor: number;
  sharePercentage: number; // النسبة من الإجمالي
}

/**
 * Debtors & Creditors Analysis Result
 */
export interface DebtorsCreditorsReport {
  debtors: PartyRow[]; // المدينون (لك - رصيد موجب)
  creditors: PartyRow[]; // الدائنون (عليك - رصيد سالب)
  totalDebtorsMinor: number; // إجمالي لك
  totalCreditorsMinor: number; // إجمالي عليك
  topDebtorName: string | null;
  topDebtorAmountMinor: number;
  topCreditorName: string | null;
  topCreditorAmountMinor: number;
}

/**
 * Calculates historical balance for an account up to a specific toDate.
 * Rejects any transactions dated > toDate.
 */
export function calculateHistoricalBalanceAt(
  account: AccountModel,
  transactions: TransactionModel[],
  toDate?: string
): number {
  const accountTxs = transactions.filter((t) => {
    if (t.accountId !== account.id) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });

  const movementsTotal = accountTxs.reduce((acc, t) => {
    return acc + getSignedTransactionMinor(t.entryType, t.amountMinor);
  }, 0);

  return account.openingBalanceMinor + movementsTotal;
}

/**
 * Generates Accounts Balance Report
 * Calculates direct historical balances up to options.toDate for all filtered accounts.
 * Strictly excludes any transactions after options.toDate.
 */
export function generateAccountsBalanceReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  options: ReportFilterOptions = {}
): AccountsBalanceReport {
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  // Filter accounts by status
  let filteredAccounts = accounts;
  if (options.status && options.status !== 'all') {
    filteredAccounts = filteredAccounts.filter((a) => a.status === options.status);
  }

  // Filter accounts by category
  if (options.categoryId && options.categoryId !== 'all') {
    filteredAccounts = filteredAccounts.filter((a) => a.categoryId === options.categoryId);
  }

  // Filter accounts by search query
  if (options.searchQuery && options.searchQuery.trim() !== '') {
    const q = options.searchQuery.trim().toLowerCase();
    filteredAccounts = filteredAccounts.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.phone && a.phone.includes(q))
    );
  }

  let totalReceivableMinor = 0;
  let totalPayableMinor = 0;
  let activeAccountsCount = 0;
  let archivedAccountsCount = 0;
  let balancedAccountsCount = 0;

  const rows: AccountBalanceReportRow[] = filteredAccounts.map((account) => {
    if (account.status === 'active') activeAccountsCount++;
    else archivedAccountsCount++;

    // Account transactions (filtered by date range)
    const accountTxs = transactions.filter((t) => t.accountId === account.id);
    
    let totalOwedByMinor = 0;
    let totalOwedToMinor = 0;

    for (const t of accountTxs) {
      if (options.fromDate && t.date < options.fromDate) continue;
      if (options.toDate && t.date > options.toDate) continue;

      if (t.entryType === 'owedByAccount') {
        totalOwedByMinor += t.amountMinor;
      } else {
        totalOwedToMinor += t.amountMinor;
      }
    }

    const netMovementMinor = totalOwedByMinor - totalOwedToMinor;
    // Calculate historical balance strictly up to options.toDate
    const currentBalanceMinor = calculateHistoricalBalanceAt(account, transactions, options.toDate);

    let balanceType: 'receivable' | 'payable' | 'balanced' = 'balanced';
    if (currentBalanceMinor > 0) {
      balanceType = 'receivable';
      totalReceivableMinor += currentBalanceMinor;
    } else if (currentBalanceMinor < 0) {
      balanceType = 'payable';
      totalPayableMinor += Math.abs(currentBalanceMinor);
    } else {
      balancedAccountsCount++;
    }

    return {
      account,
      categoryName: categoryMap.get(account.categoryId) || 'غير مصنف',
      openingBalanceMinor: account.openingBalanceMinor,
      totalOwedByMinor,
      totalOwedToMinor,
      netMovementMinor,
      currentBalanceMinor,
      balanceType,
    };
  });

  const netBalanceMinor = totalReceivableMinor - totalPayableMinor;

  return {
    rows,
    totalReceivableMinor,
    totalPayableMinor,
    netBalanceMinor,
    activeAccountsCount,
    archivedAccountsCount,
    balancedAccountsCount,
  };
}

/**
 * Generates Category Summary Report
 * Groups direct historical balances of active accounts by category up to optional toDate.
 * Prevents double-counting parent/child because each account belongs to one category.
 */
export function generateCategorySummaryReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  toDate?: string
): CategorySummaryReport {
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const accountBalances = new Map<string, number>();

  for (const acc of activeAccounts) {
    accountBalances.set(acc.id, calculateHistoricalBalanceAt(acc, transactions, toDate));
  }

  let grandTotalReceivableMinor = 0;
  let grandTotalPayableMinor = 0;

  const categoryRows: CategorySummaryReportRow[] = categories.map((cat) => {
    const catAccounts = activeAccounts.filter((a) => a.categoryId === cat.id);
    let totalReceivableMinor = 0;
    let totalPayableMinor = 0;

    for (const acc of catAccounts) {
      const bal = accountBalances.get(acc.id) || 0;
      if (bal > 0) {
        totalReceivableMinor += bal;
      } else if (bal < 0) {
        totalPayableMinor += Math.abs(bal);
      }
    }

    grandTotalReceivableMinor += totalReceivableMinor;
    grandTotalPayableMinor += totalPayableMinor;

    return {
      category: cat,
      accountsCount: catAccounts.length,
      totalReceivableMinor,
      totalPayableMinor,
      netBalanceMinor: totalReceivableMinor - totalPayableMinor,
    };
  });

  // Handle uncategorized accounts if any exist
  const knownCatIds = new Set(categories.map((c) => c.id));
  const uncategorized = activeAccounts.filter((a) => !knownCatIds.has(a.categoryId));
  
  if (uncategorized.length > 0) {
    let uncatReceivable = 0;
    let uncatPayable = 0;
    for (const acc of uncategorized) {
      const bal = accountBalances.get(acc.id) || 0;
      if (bal > 0) uncatReceivable += bal;
      else if (bal < 0) uncatPayable += Math.abs(bal);
    }
    grandTotalReceivableMinor += uncatReceivable;
    grandTotalPayableMinor += uncatPayable;

    categoryRows.push({
      category: { id: 'uncategorized', name: 'غير مصنف', sortOrder: 999 },
      accountsCount: uncategorized.length,
      totalReceivableMinor: uncatReceivable,
      totalPayableMinor: uncatPayable,
      netBalanceMinor: uncatReceivable - uncatPayable,
    });
  }

  const grandNetBalanceMinor = grandTotalReceivableMinor - grandTotalPayableMinor;

  return {
    rows: categoryRows,
    grandTotalReceivableMinor,
    grandTotalPayableMinor,
    grandNetBalanceMinor,
    totalCategoriesCount: categoryRows.length,
  };
}

/**
 * Generates Period Summary Report for specified date range across all active accounts
 */
export function generatePeriodSummaryReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  fromDate?: string,
  toDate?: string
): PeriodSummaryReport {
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const accountMap = new Map<string, AccountModel>(activeAccounts.map((a) => [a.id, a]));
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  // Calculate global opening balance before fromDate
  let openingBalanceMinor = 0;
  for (const acc of activeAccounts) {
    openingBalanceMinor += acc.openingBalanceMinor;
  }

  for (const t of transactions) {
    if (!accountMap.has(t.accountId)) continue; // Skip archived or non-existent
    if (fromDate && t.date < fromDate) {
      openingBalanceMinor += getSignedTransactionMinor(t.entryType, t.amountMinor);
    }
  }

  // Filter transactions within period
  let totalOwedByMinor = 0;
  let totalOwedToMinor = 0;
  const rows: PeriodTransactionRow[] = [];

  const periodTxs = transactions
    .filter((t) => {
      if (!accountMap.has(t.accountId)) return false;
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      return true;
    })
    .sort(compareTransactions); // Stable sorting by date ASC, createdAt ASC, id ASC

  for (const t of periodTxs) {
    const acc = accountMap.get(t.accountId)!;
    const signedDelta = getSignedTransactionMinor(t.entryType, t.amountMinor);
    
    if (t.entryType === 'owedByAccount') {
      totalOwedByMinor += t.amountMinor;
    } else {
      totalOwedToMinor += t.amountMinor;
    }

    rows.push({
      transaction: t,
      accountName: acc.name,
      categoryName: categoryMap.get(acc.categoryId) || 'غير مصنف',
      signedAmountMinor: signedDelta,
    });
  }

  const periodNetChangeMinor = totalOwedByMinor - totalOwedToMinor;
  const closingBalanceMinor = openingBalanceMinor + periodNetChangeMinor;

  return {
    fromDate,
    toDate,
    openingBalanceMinor,
    totalOwedByMinor,
    totalOwedToMinor,
    periodNetChangeMinor,
    closingBalanceMinor,
    transactionsCount: rows.length,
    rows,
  };
}

/**
 * Generates Debtors & Creditors (Parties) Report
 */
export function generateDebtorsCreditorsReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  toDate?: string
): DebtorsCreditorsReport {
  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  const debtorRows: PartyRow[] = [];
  const creditorRows: PartyRow[] = [];

  let totalDebtorsMinor = 0;
  let totalCreditorsMinor = 0;

  for (const acc of activeAccounts) {
    const bal = calculateHistoricalBalanceAt(acc, transactions, toDate);
    const catName = categoryMap.get(acc.categoryId) || 'غير مصنف';

    if (bal > 0) {
      totalDebtorsMinor += bal;
      debtorRows.push({
        account: acc,
        categoryName: catName,
        balanceMinor: bal,
        absBalanceMinor: bal,
        sharePercentage: 0,
      });
    } else if (bal < 0) {
      const absBal = Math.abs(bal);
      totalCreditorsMinor += absBal;
      creditorRows.push({
        account: acc,
        categoryName: catName,
        balanceMinor: bal,
        absBalanceMinor: absBal,
        sharePercentage: 0,
      });
    }
  }

  // Sort debtors descending by balance
  debtorRows.sort((a, b) => b.balanceMinor - a.balanceMinor);
  // Sort creditors descending by absolute debt
  creditorRows.sort((a, b) => b.absBalanceMinor - a.absBalanceMinor);

  // Calculate percentages
  if (totalDebtorsMinor > 0) {
    for (const d of debtorRows) {
      d.sharePercentage = (d.balanceMinor / totalDebtorsMinor) * 100;
    }
  }
  if (totalCreditorsMinor > 0) {
    for (const c of creditorRows) {
      c.sharePercentage = (c.absBalanceMinor / totalCreditorsMinor) * 100;
    }
  }

  const topDebtor = debtorRows[0];
  const topCreditor = creditorRows[0];

  return {
    debtors: debtorRows,
    creditors: creditorRows,
    totalDebtorsMinor,
    totalCreditorsMinor,
    topDebtorName: topDebtor ? topDebtor.account.name : null,
    topDebtorAmountMinor: topDebtor ? topDebtor.balanceMinor : 0,
    topCreditorName: topCreditor ? topCreditor.account.name : null,
    topCreditorAmountMinor: topCreditor ? topCreditor.absBalanceMinor : 0,
  };
}
