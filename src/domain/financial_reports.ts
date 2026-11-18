/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Unified ReportScope & Financial Reports Domain Engine
 * Follows Document v2 Sections 3, 4, 16 & WEB-F3 Specifications:
 * - Unified ReportScope (fromDate, toDate, categoryId, status) separated from display searchQuery
 * - Central isReportRelevantAccount helper (hides Zero Dormant 0 / 0 tx / 0 accounts across all reports)
 * - Date Range Guard (fromDate > toDate)
 * - Accounts Balance Report, Category Aggregation Report, Period Summary Report, Debtors/Creditors Report
 */

import { AccountModel, CategoryModel, TransactionModel } from './types.ts';
import { compareTransactions, getSignedTransactionMinor } from './balance_calculator.ts';

/**
 * Financial Report Scope — applies BEFORE computing balances, totals, counts, Excel, or PDF.
 * Explicitly excludes searchQuery (which is strictly a "Search Within Report Results" display filter).
 */
export interface ReportScope {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  categoryId?: string; // 'all', 'uncategorized', or specific category ID
  status?: 'all' | 'active' | 'archived';
}

/**
 * Filter options combining Financial ReportScope with display-only searchQuery.
 */
export interface ReportFilterOptions extends ReportScope {
  searchQuery?: string;
}

export interface NormalizedReportScope {
  fromDate?: string;
  toDate?: string;
  categoryId: string;
  status: 'all' | 'active' | 'archived';
}

export interface ReportDateValidation {
  valid: boolean;
  errorMessage?: string;
}

export const DATE_RANGE_ERROR_MESSAGE = 'تاريخ بداية الفترة يجب ألا يكون بعد تاريخ النهاية.';

/**
 * Validates that fromDate is not after toDate.
 */
export function validateReportScopeDates(
  scope: Pick<ReportScope, 'fromDate' | 'toDate'>
): ReportDateValidation {
  if (scope.fromDate && scope.toDate && scope.fromDate > scope.toDate) {
    return {
      valid: false,
      errorMessage: DATE_RANGE_ERROR_MESSAGE,
    };
  }
  return { valid: true };
}

export function normalizeReportScope(
  scope: ReportScope = {},
  defaultStatus: 'all' | 'active' | 'archived' = 'all'
): NormalizedReportScope {
  return {
    fromDate: scope.fromDate || undefined,
    toDate: scope.toDate || undefined,
    categoryId: scope.categoryId || 'all',
    status: scope.status ?? defaultStatus,
  };
}

/**
 * Period financial metrics for a single direct account over [fromDate, toDate].
 */
export interface AccountPeriodMetrics {
  originalOpeningBalanceMinor: number;
  openingAtPeriodMinor: number;
  directOwedByMinor: number;
  directOwedToMinor: number;
  directNetMovementMinor: number;
  closingBalanceMinor: number;
  periodTransactionCount: number;
  lastTransactionDate: string | null;
  lastTransactionAmountMinor: number | null;
}

/**
 * Computes direct opening-at-period, in-period movements, closing balance, and tx count
 * cleanly without modifying core AccountModel/TransactionModel.
 */
export function computeAccountPeriodMetrics(
  account: AccountModel,
  accountTransactions: TransactionModel[],
  fromDate?: string,
  toDate?: string
): AccountPeriodMetrics {
  let prePeriodDelta = 0;
  let directOwedByMinor = 0;
  let directOwedToMinor = 0;
  let periodTransactionCount = 0;
  let lastTx: TransactionModel | null = null;

  for (const t of accountTransactions) {
    if (toDate && t.date > toDate) continue;

    if (!lastTx || compareTransactions(lastTx, t) < 0) {
      lastTx = t;
    }

    if (fromDate && t.date < fromDate) {
      prePeriodDelta += getSignedTransactionMinor(t.entryType, t.amountMinor);
    } else {
      periodTransactionCount++;
      if (t.entryType === 'owedByAccount') {
        directOwedByMinor += t.amountMinor;
      } else {
        directOwedToMinor += t.amountMinor;
      }
    }
  }

  const originalOpeningBalanceMinor = account.openingBalanceMinor;
  const openingAtPeriodMinor = originalOpeningBalanceMinor + prePeriodDelta;
  const directNetMovementMinor = directOwedByMinor - directOwedToMinor;
  const closingBalanceMinor = openingAtPeriodMinor + directNetMovementMinor;

  return {
    originalOpeningBalanceMinor,
    openingAtPeriodMinor,
    directOwedByMinor,
    directOwedToMinor,
    directNetMovementMinor,
    closingBalanceMinor,
    periodTransactionCount,
    lastTransactionDate: lastTx ? lastTx.date : null,
    lastTransactionAmountMinor: lastTx ? lastTx.amountMinor : null,
  };
}

/**
 * Central Mandatory Rule (#1):
 * Returns false (hide from financial reports) ONLY when ALL three are zero:
 *   openingAtPeriodMinor === 0
 *   AND closingBalanceMinor === 0
 *   AND periodTransactionCount === 0
 * Never hide an account that moved during the period even if it closed at 0,
 * or holds a non-zero opening or closing balance.
 */
export function isReportRelevantAccount(metrics: {
  openingAtPeriodMinor: number;
  closingBalanceMinor: number;
  periodTransactionCount: number;
}): boolean {
  return (
    metrics.openingAtPeriodMinor !== 0 ||
    metrics.closingBalanceMinor !== 0 ||
    metrics.periodTransactionCount > 0
  );
}

/**
 * Matches public account fields (name or phone) ONLY — NEVER searches private AccountModel.notes.
 */
export function matchesPublicSearchTerms(account: AccountModel, searchQuery?: string): boolean {
  const normalized = searchQuery ? searchQuery.trim().toLowerCase() : '';
  if (!normalized) return true;
  return (
    account.name.toLowerCase().includes(normalized) ||
    Boolean(account.phone && account.phone.toLowerCase().includes(normalized))
  );
}

/**
 * Accounts Balance Report Row
 */
export interface AccountBalanceReportRow {
  account: AccountModel;
  categoryName: string;
  parentName: string | null;
  hierarchicalPath: string;
  originalOpeningBalanceMinor: number;
  openingAtPeriodMinor: number;
  openingBalanceMinor: number; // Alias of openingAtPeriodMinor so Opening + OwedBy - OwedTo === Closing
  totalOwedByMinor: number; // إجمالي عليه خلال الفترة
  totalOwedToMinor: number; // إجمالي له خلال الفترة
  netMovementMinor: number;
  currentBalanceMinor: number; // الرصيد الختامي التاريخي حتى نهاية الفترة المحددة
  periodTransactionCount: number;
  balanceType: 'receivable' | 'payable' | 'balanced'; // لك (موجب) | عليك (سالب) | متزن (صفر)
}

/**
 * Accounts Balance Report Result (Single Source of Truth for Accounts Tab, Excel & PDF)
 */
export interface AccountsBalanceReport {
  validationError?: string;
  appliedScope: NormalizedReportScope;
  rows: AccountBalanceReportRow[];
  totalReceivableMinor: number; // إجمالي لك (ثابت ضمن ReportScope ولا يتغير بالبحث)
  totalPayableMinor: number; // إجمالي عليك (ثابت ضمن ReportScope ولا يتغير بالبحث)
  netBalanceMinor: number; // صافي المركز المالي
  totalOpeningAtPeriodMinor: number;
  totalPeriodOwedByMinor: number;
  totalPeriodOwedToMinor: number;
  totalPeriodNetMovementMinor: number;
  totalClosingBalanceMinor: number;
  activeAccountsCount: number;
  archivedAccountsCount: number;
  balancedAccountsCount: number;
  totalScopedAccountsCount: number; // عدد الحسابات المشمولة بعد استبعاد الصفرية الخاملة
  excludedDormantCount: number; // عدد الحسابات الصفرية الخاملة المستبعدة
  searchMatchCount: number; // عدد نتائج البحث (مطابق لـ totalScopedAccountsCount إن لم يكن هناك بحث)
}

/**
 * Category Summary Report Row
 */
export interface CategorySummaryReportRow {
  category: CategoryModel;
  accountsCount: number;
  openingAtPeriodMinor: number;
  periodOwedByMinor: number;
  periodOwedToMinor: number;
  periodNetMovementMinor: number;
  totalReceivableMinor: number; // لك في هذا التصنيف
  totalPayableMinor: number; // عليك في هذا التصنيف
  netBalanceMinor: number; // الصافي
}

/**
 * Category Summary Report Result
 */
export interface CategorySummaryReport {
  validationError?: string;
  appliedScope: NormalizedReportScope;
  rows: CategorySummaryReportRow[];
  grandTotalReceivableMinor: number;
  grandTotalPayableMinor: number;
  grandNetBalanceMinor: number;
  totalCategoriesCount: number;
  includedAccountsCount: number;
  excludedDormantCount: number;
}

/**
 * Period Statement Report Row
 */
export interface PeriodTransactionRow {
  transaction: TransactionModel;
  accountName: string;
  hierarchicalPath: string;
  categoryName: string;
  signedAmountMinor: number;
}

/**
 * Period Summary Report Result
 */
export interface PeriodSummaryReport {
  validationError?: string;
  appliedScope: NormalizedReportScope;
  fromDate?: string;
  toDate?: string;
  openingBalanceMinor: number; // الرصيد الافتتاحي الإجمالي قبل بداية الفترة
  totalOwedByMinor: number; // إجمالي المقبوضات/عليه خلال الفترة
  totalOwedToMinor: number; // إجمالي المدفوعات/له خلال الفترة
  periodNetChangeMinor: number; // التغير الصافي خلال الفترة
  closingBalanceMinor: number; // الرصيد الختامي الإجمالي في نهاية الفترة
  transactionsCount: number; // عدد الحركات المالي ضمن ReportScope (غير متأثر بالبحث)
  searchMatchCount: number; // عدد الحركات الظاهرة بعد البحث
  includedAccountsCount: number;
  excludedDormantCount: number;
  rows: PeriodTransactionRow[];
}

/**
 * Single Party (Debtor/Creditor) Entity
 */
export interface PartyRow {
  account: AccountModel;
  categoryName: string;
  hierarchicalPath: string;
  balanceMinor: number; // Positive for debtor (لك), Negative for creditor (عليك)
  absBalanceMinor: number;
  sharePercentage: number; // النسبة من الإجمالي المالي (ضمن ReportScope)
}

/**
 * Debtors & Creditors Analysis Result
 */
export interface DebtorsCreditorsReport {
  validationError?: string;
  appliedScope: NormalizedReportScope;
  debtors: PartyRow[]; // المدينون (لك - رصيد موجب > 0)
  creditors: PartyRow[]; // الدائنون (عليك - رصيد سالب < 0)
  totalDebtorsMinor: number; // إجمالي لك (ثابت ضمن ReportScope)
  totalCreditorsMinor: number; // إجمالي عليك (ثابت ضمن ReportScope)
  totalDebtorsCount: number; // عدد المدينين الكلي ضمن ReportScope
  totalCreditorsCount: number; // عدد الدائنين الكلي ضمن ReportScope
  includedAccountsCount: number;
  excludedDormantCount: number;
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

function groupTransactionsByAccount(transactions: TransactionModel[]): Map<string, TransactionModel[]> {
  const map = new Map<string, TransactionModel[]>();
  for (const t of transactions) {
    const list = map.get(t.accountId);
    if (list) list.push(t);
    else map.set(t.accountId, [t]);
  }
  return map;
}

function buildFullPathLabel(accountId: string, fullAccountMap: Map<string, AccountModel>): string {
  const names: string[] = [];
  const visited = new Set<string>();
  let currId: string | null = accountId;
  while (currId) {
    if (visited.has(currId)) break;
    visited.add(currId);
    const acc = fullAccountMap.get(currId);
    if (!acc) break;
    names.unshift(acc.name);
    currId = acc.parentId;
  }
  return names.join(' > ');
}

function filterAccountsByFinancialScope(
  accounts: AccountModel[],
  scope: NormalizedReportScope,
  categories?: CategoryModel[]
): AccountModel[] {
  const knownCategoryIds = categories ? new Set(categories.map((c) => c.id)) : null;
  return accounts.filter((a) => {
    if (scope.status !== 'all' && a.status !== scope.status) {
      return false;
    }
    if (scope.categoryId && scope.categoryId !== 'all') {
      if (scope.categoryId === 'uncategorized') {
        if (knownCategoryIds && knownCategoryIds.has(a.categoryId)) return false;
      } else if (a.categoryId !== scope.categoryId) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Generates Accounts Balance Report
 * - Enforces ReportDateValidation (fromDate <= toDate)
 * - Applies ReportScope (fromDate, toDate, status, categoryId)
 * - Excludes Zero Dormant Accounts via central isReportRelevantAccount()
 * - Separates searchQuery as display-only filter so financial totals never change during search
 */
export function generateAccountsBalanceReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  options: ReportFilterOptions = {}
): AccountsBalanceReport {
  const scope = normalizeReportScope(options, 'all');
  const validation = validateReportScopeDates(scope);

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      appliedScope: scope,
      rows: [],
      totalReceivableMinor: 0,
      totalPayableMinor: 0,
      netBalanceMinor: 0,
      totalOpeningAtPeriodMinor: 0,
      totalPeriodOwedByMinor: 0,
      totalPeriodOwedToMinor: 0,
      totalPeriodNetMovementMinor: 0,
      totalClosingBalanceMinor: 0,
      activeAccountsCount: 0,
      archivedAccountsCount: 0,
      balancedAccountsCount: 0,
      totalScopedAccountsCount: 0,
      excludedDormantCount: 0,
      searchMatchCount: 0,
    };
  }

  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const fullAccountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const txByAccount = groupTransactionsByAccount(transactions);

  const scopedAccounts = filterAccountsByFinancialScope(accounts, scope, categories);

  let totalReceivableMinor = 0;
  let totalPayableMinor = 0;
  let totalOpeningAtPeriodMinor = 0;
  let totalPeriodOwedByMinor = 0;
  let totalPeriodOwedToMinor = 0;
  let activeAccountsCount = 0;
  let archivedAccountsCount = 0;
  let balancedAccountsCount = 0;
  let excludedDormantCount = 0;

  const relevantRows: AccountBalanceReportRow[] = [];

  for (const account of scopedAccounts) {
    const accTxs = txByAccount.get(account.id) || [];
    const metrics = computeAccountPeriodMetrics(account, accTxs, scope.fromDate, scope.toDate);

    if (!isReportRelevantAccount(metrics)) {
      excludedDormantCount++;
      continue;
    }

    if (account.status === 'active') activeAccountsCount++;
    else archivedAccountsCount++;

    totalOpeningAtPeriodMinor += metrics.openingAtPeriodMinor;
    totalPeriodOwedByMinor += metrics.directOwedByMinor;
    totalPeriodOwedToMinor += metrics.directOwedToMinor;

    let balanceType: 'receivable' | 'payable' | 'balanced' = 'balanced';
    if (metrics.closingBalanceMinor > 0) {
      balanceType = 'receivable';
      totalReceivableMinor += metrics.closingBalanceMinor;
    } else if (metrics.closingBalanceMinor < 0) {
      balanceType = 'payable';
      totalPayableMinor += Math.abs(metrics.closingBalanceMinor);
    } else {
      balancedAccountsCount++;
    }

    const parentAcc = account.parentId ? fullAccountMap.get(account.parentId) : undefined;
    const hierarchicalPath = buildFullPathLabel(account.id, fullAccountMap) || account.name;

    relevantRows.push({
      account,
      categoryName: categoryMap.get(account.categoryId) || 'غير مصنف',
      parentName: parentAcc ? parentAcc.name : null,
      hierarchicalPath,
      originalOpeningBalanceMinor: metrics.originalOpeningBalanceMinor,
      openingAtPeriodMinor: metrics.openingAtPeriodMinor,
      openingBalanceMinor: metrics.openingAtPeriodMinor,
      totalOwedByMinor: metrics.directOwedByMinor,
      totalOwedToMinor: metrics.directOwedToMinor,
      netMovementMinor: metrics.directNetMovementMinor,
      currentBalanceMinor: metrics.closingBalanceMinor,
      periodTransactionCount: metrics.periodTransactionCount,
      balanceType,
    });
  }

  const netBalanceMinor = totalReceivableMinor - totalPayableMinor;
  const totalPeriodNetMovementMinor = totalPeriodOwedByMinor - totalPeriodOwedToMinor;
  const totalClosingBalanceMinor = totalOpeningAtPeriodMinor + totalPeriodNetMovementMinor;

  // Apply Search Within Report Results ONLY on displayed rows (totals stay unchanged)
  const hasSearch = Boolean(options.searchQuery && options.searchQuery.trim() !== '');
  const visibleRows = hasSearch
    ? relevantRows.filter((r) => matchesPublicSearchTerms(r.account, options.searchQuery))
    : relevantRows;

  return {
    appliedScope: scope,
    rows: visibleRows,
    totalReceivableMinor,
    totalPayableMinor,
    netBalanceMinor,
    totalOpeningAtPeriodMinor,
    totalPeriodOwedByMinor,
    totalPeriodOwedToMinor,
    totalPeriodNetMovementMinor,
    totalClosingBalanceMinor,
    activeAccountsCount,
    archivedAccountsCount,
    balancedAccountsCount,
    totalScopedAccountsCount: relevantRows.length,
    excludedDormantCount,
    searchMatchCount: visibleRows.length,
  };
}

/**
 * Generates Category Summary Report
 * Supports full ReportScope (fromDate, toDate, status, categoryId) while remaining
 * backward-compatible with legacy 4th argument `toDate?: string`.
 * Respects isReportRelevantAccount so dormant 0/0/0 accounts are never counted.
 */
export function generateCategorySummaryReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  scopeOrToDate?: ReportScope | string
): CategorySummaryReport {
  const rawScope: ReportScope =
    typeof scopeOrToDate === 'string'
      ? { toDate: scopeOrToDate || undefined, status: 'active', categoryId: 'all' }
      : scopeOrToDate ?? { status: 'active', categoryId: 'all' };

  const scope = normalizeReportScope(rawScope, 'active');
  const validation = validateReportScopeDates(scope);

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      appliedScope: scope,
      rows: [],
      grandTotalReceivableMinor: 0,
      grandTotalPayableMinor: 0,
      grandNetBalanceMinor: 0,
      totalCategoriesCount: 0,
      includedAccountsCount: 0,
      excludedDormantCount: 0,
    };
  }

  const txByAccount = groupTransactionsByAccount(transactions);
  const statusScopedAccounts = filterAccountsByFinancialScope(
    accounts,
    { ...scope, categoryId: 'all' },
    categories
  );

  // Filter relevant accounts for the category scope first
  let excludedDormantCount = 0;
  let includedAccountsCount = 0;
  const relevantMetrics = new Map<string, AccountPeriodMetrics>();
  const relevantByAccountList: AccountModel[] = [];
  const knownCatIds = new Set(categories.map((c) => c.id));

  for (const acc of statusScopedAccounts) {
    // Apply categoryId scope if specified
    if (scope.categoryId && scope.categoryId !== 'all') {
      if (scope.categoryId === 'uncategorized') {
        if (knownCatIds.has(acc.categoryId)) continue;
      } else if (acc.categoryId !== scope.categoryId) {
        continue;
      }
    }

    const accTxs = txByAccount.get(acc.id) || [];
    const metrics = computeAccountPeriodMetrics(acc, accTxs, scope.fromDate, scope.toDate);
    if (!isReportRelevantAccount(metrics)) {
      excludedDormantCount++;
      continue;
    }

    includedAccountsCount++;
    relevantMetrics.set(acc.id, metrics);
    relevantByAccountList.push(acc);
  }

  let grandTotalReceivableMinor = 0;
  let grandTotalPayableMinor = 0;
  const categoryRows: CategorySummaryReportRow[] = [];

  const targetCategories =
    scope.categoryId !== 'all' && scope.categoryId !== 'uncategorized'
      ? categories.filter((c) => c.id === scope.categoryId)
      : scope.categoryId === 'uncategorized'
      ? []
      : categories;

  for (const cat of targetCategories) {
    const catAccounts = relevantByAccountList.filter((a) => a.categoryId === cat.id);
    if (catAccounts.length === 0) continue;

    let totalReceivableMinor = 0;
    let totalPayableMinor = 0;
    let openingAtPeriodMinor = 0;
    let periodOwedByMinor = 0;
    let periodOwedToMinor = 0;
    let periodNetMovementMinor = 0;

    for (const acc of catAccounts) {
      const m = relevantMetrics.get(acc.id)!;
      openingAtPeriodMinor += m.openingAtPeriodMinor;
      periodOwedByMinor += m.directOwedByMinor;
      periodOwedToMinor += m.directOwedToMinor;
      periodNetMovementMinor += m.directNetMovementMinor;
      if (m.closingBalanceMinor > 0) {
        totalReceivableMinor += m.closingBalanceMinor;
      } else if (m.closingBalanceMinor < 0) {
        totalPayableMinor += Math.abs(m.closingBalanceMinor);
      }
    }

    grandTotalReceivableMinor += totalReceivableMinor;
    grandTotalPayableMinor += totalPayableMinor;

    categoryRows.push({
      category: cat,
      accountsCount: catAccounts.length,
      openingAtPeriodMinor,
      periodOwedByMinor,
      periodOwedToMinor,
      periodNetMovementMinor,
      totalReceivableMinor,
      totalPayableMinor,
      netBalanceMinor: totalReceivableMinor - totalPayableMinor,
    });
  }

  // Handle uncategorized relevant accounts if any
  if (scope.categoryId === 'all' || scope.categoryId === 'uncategorized') {
    const uncategorized = relevantByAccountList.filter((a) => !knownCatIds.has(a.categoryId));
    if (uncategorized.length > 0) {
      let uncatReceivable = 0;
      let uncatPayable = 0;
      let openingAtPeriodMinor = 0;
      let periodOwedByMinor = 0;
      let periodOwedToMinor = 0;
      let periodNetMovementMinor = 0;

      for (const acc of uncategorized) {
        const m = relevantMetrics.get(acc.id)!;
        openingAtPeriodMinor += m.openingAtPeriodMinor;
        periodOwedByMinor += m.directOwedByMinor;
        periodOwedToMinor += m.directOwedToMinor;
        periodNetMovementMinor += m.directNetMovementMinor;
        if (m.closingBalanceMinor > 0) uncatReceivable += m.closingBalanceMinor;
        else if (m.closingBalanceMinor < 0) uncatPayable += Math.abs(m.closingBalanceMinor);
      }
      grandTotalReceivableMinor += uncatReceivable;
      grandTotalPayableMinor += uncatPayable;

      categoryRows.push({
        category: { id: 'uncategorized', name: 'غير مصنف', sortOrder: 999 },
        accountsCount: uncategorized.length,
        openingAtPeriodMinor,
        periodOwedByMinor,
        periodOwedToMinor,
        periodNetMovementMinor,
        totalReceivableMinor: uncatReceivable,
        totalPayableMinor: uncatPayable,
        netBalanceMinor: uncatReceivable - uncatPayable,
      });
    }
  }

  const grandNetBalanceMinor = grandTotalReceivableMinor - grandTotalPayableMinor;

  return {
    appliedScope: scope,
    rows: categoryRows,
    grandTotalReceivableMinor,
    grandTotalPayableMinor,
    grandNetBalanceMinor,
    totalCategoriesCount: categoryRows.length,
    includedAccountsCount,
    excludedDormantCount,
  };
}

/**
 * Generates Period Summary Report for specified ReportScope (dates, status, categoryId)
 * with display-only searchQuery separated from financial totals.
 * Backward-compatible with legacy signature (accounts, transactions, categories, fromDate, toDate).
 */
export function generatePeriodSummaryReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  scopeOrFromDate?: ReportFilterOptions | string,
  legacyToDate?: string
): PeriodSummaryReport {
  const rawOptions: ReportFilterOptions =
    typeof scopeOrFromDate === 'object' && scopeOrFromDate !== null
      ? scopeOrFromDate
      : {
          fromDate: scopeOrFromDate || undefined,
          toDate: legacyToDate || undefined,
          status: 'active',
          categoryId: 'all',
        };

  const scope = normalizeReportScope(rawOptions, 'active');
  const validation = validateReportScopeDates(scope);

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      appliedScope: scope,
      fromDate: scope.fromDate,
      toDate: scope.toDate,
      openingBalanceMinor: 0,
      totalOwedByMinor: 0,
      totalOwedToMinor: 0,
      periodNetChangeMinor: 0,
      closingBalanceMinor: 0,
      transactionsCount: 0,
      searchMatchCount: 0,
      includedAccountsCount: 0,
      excludedDormantCount: 0,
      rows: [],
    };
  }

  const scopedAccounts = filterAccountsByFinancialScope(accounts, scope, categories);
  const fullAccountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const txByAccount = groupTransactionsByAccount(transactions);

  let excludedDormantCount = 0;
  let includedAccountsCount = 0;
  let openingBalanceMinor = 0;
  const relevantAccountMap = new Map<string, AccountModel>();

  for (const acc of scopedAccounts) {
    const accTxs = txByAccount.get(acc.id) || [];
    const metrics = computeAccountPeriodMetrics(acc, accTxs, scope.fromDate, scope.toDate);
    if (!isReportRelevantAccount(metrics)) {
      excludedDormantCount++;
      continue;
    }
    includedAccountsCount++;
    relevantAccountMap.set(acc.id, acc);
    openingBalanceMinor += metrics.openingAtPeriodMinor;
  }

  let totalOwedByMinor = 0;
  let totalOwedToMinor = 0;

  const periodTxs = transactions
    .filter((t) => {
      if (!relevantAccountMap.has(t.accountId)) return false;
      if (scope.fromDate && t.date < scope.fromDate) return false;
      if (scope.toDate && t.date > scope.toDate) return false;
      return true;
    })
    .sort(compareTransactions);

  const allRows: PeriodTransactionRow[] = periodTxs.map((t) => {
    const acc = relevantAccountMap.get(t.accountId)!;
    const signedDelta = getSignedTransactionMinor(t.entryType, t.amountMinor);

    if (t.entryType === 'owedByAccount') {
      totalOwedByMinor += t.amountMinor;
    } else {
      totalOwedToMinor += t.amountMinor;
    }

    return {
      transaction: t,
      accountName: acc.name,
      hierarchicalPath: buildFullPathLabel(acc.id, fullAccountMap) || acc.name,
      categoryName: categoryMap.get(acc.categoryId) || 'غير مصنف',
      signedAmountMinor: signedDelta,
    };
  });

  const periodNetChangeMinor = totalOwedByMinor - totalOwedToMinor;
  const closingBalanceMinor = openingBalanceMinor + periodNetChangeMinor;

  // Apply Search Within Report Results ONLY to displayed rows (totals stay unchanged)
  const searchLower = rawOptions.searchQuery ? rawOptions.searchQuery.trim().toLowerCase() : '';
  const visibleRows = searchLower
    ? allRows.filter((r) => {
        const acc = relevantAccountMap.get(r.transaction.accountId);
        return (
          (acc && matchesPublicSearchTerms(acc, searchLower)) ||
          r.transaction.description.toLowerCase().includes(searchLower)
        );
      })
    : allRows;

  return {
    appliedScope: scope,
    fromDate: scope.fromDate,
    toDate: scope.toDate,
    openingBalanceMinor,
    totalOwedByMinor,
    totalOwedToMinor,
    periodNetChangeMinor,
    closingBalanceMinor,
    transactionsCount: allRows.length,
    searchMatchCount: visibleRows.length,
    includedAccountsCount,
    excludedDormantCount,
    rows: visibleRows,
  };
}

/**
 * Generates Debtors & Creditors (Parties) Report
 * - Supports full ReportScope (toDate, status, categoryId) + display-only searchQuery
 * - Strictly excludes zero balances (bal === 0 never shown)
 * - Backward-compatible with legacy 4th argument `toDate?: string`
 */
export function generateDebtorsCreditorsReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  scopeOrToDate?: ReportFilterOptions | string
): DebtorsCreditorsReport {
  const rawOptions: ReportFilterOptions =
    typeof scopeOrToDate === 'object' && scopeOrToDate !== null
      ? scopeOrToDate
      : { toDate: scopeOrToDate || undefined, status: 'active', categoryId: 'all' };

  const scope = normalizeReportScope(rawOptions, 'active');
  const validation = validateReportScopeDates(scope);

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      appliedScope: scope,
      debtors: [],
      creditors: [],
      totalDebtorsMinor: 0,
      totalCreditorsMinor: 0,
      totalDebtorsCount: 0,
      totalCreditorsCount: 0,
      includedAccountsCount: 0,
      excludedDormantCount: 0,
      topDebtorName: null,
      topDebtorAmountMinor: 0,
      topCreditorName: null,
      topCreditorAmountMinor: 0,
    };
  }

  const scopedAccounts = filterAccountsByFinancialScope(accounts, scope, categories);
  const fullAccountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  const allDebtors: PartyRow[] = [];
  const allCreditors: PartyRow[] = [];

  let totalDebtorsMinor = 0;
  let totalCreditorsMinor = 0;
  let excludedDormantCount = 0;

  for (const acc of scopedAccounts) {
    const bal = calculateHistoricalBalanceAt(acc, transactions, scope.toDate);
    if (bal === 0) {
      // Section 21: Zero balances strictly excluded from Debtors/Creditors analysis
      excludedDormantCount++;
      continue;
    }

    const catName = categoryMap.get(acc.categoryId) || 'غير مصنف';
    const hierarchicalPath = buildFullPathLabel(acc.id, fullAccountMap) || acc.name;

    if (bal > 0) {
      totalDebtorsMinor += bal;
      allDebtors.push({
        account: acc,
        categoryName: catName,
        hierarchicalPath,
        balanceMinor: bal,
        absBalanceMinor: bal,
        sharePercentage: 0,
      });
    } else {
      const absBal = Math.abs(bal);
      totalCreditorsMinor += absBal;
      allCreditors.push({
        account: acc,
        categoryName: catName,
        hierarchicalPath,
        balanceMinor: bal,
        absBalanceMinor: absBal,
        sharePercentage: 0,
      });
    }
  }

  allDebtors.sort((a, b) => b.balanceMinor - a.balanceMinor);
  allCreditors.sort((a, b) => b.absBalanceMinor - a.absBalanceMinor);

  if (totalDebtorsMinor > 0) {
    for (const d of allDebtors) {
      d.sharePercentage = (d.balanceMinor / totalDebtorsMinor) * 100;
    }
  }
  if (totalCreditorsMinor > 0) {
    for (const c of allCreditors) {
      c.sharePercentage = (c.absBalanceMinor / totalCreditorsMinor) * 100;
    }
  }

  const topDebtor = allDebtors[0];
  const topCreditor = allCreditors[0];

  const hasSearch = Boolean(rawOptions.searchQuery && rawOptions.searchQuery.trim() !== '');
  const visibleDebtors = hasSearch
    ? allDebtors.filter((d) => matchesPublicSearchTerms(d.account, rawOptions.searchQuery))
    : allDebtors;
  const visibleCreditors = hasSearch
    ? allCreditors.filter((c) => matchesPublicSearchTerms(c.account, rawOptions.searchQuery))
    : allCreditors;

  return {
    appliedScope: scope,
    debtors: visibleDebtors,
    creditors: visibleCreditors,
    totalDebtorsMinor,
    totalCreditorsMinor,
    totalDebtorsCount: allDebtors.length,
    totalCreditorsCount: allCreditors.length,
    includedAccountsCount: allDebtors.length + allCreditors.length,
    excludedDormantCount,
    topDebtorName: topDebtor ? topDebtor.account.name : null,
    topDebtorAmountMinor: topDebtor ? topDebtor.balanceMinor : 0,
    topCreditorName: topCreditor ? topCreditor.account.name : null,
    topCreditorAmountMinor: topCreditor ? topCreditor.absBalanceMinor : 0,
  };
}
