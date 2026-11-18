/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Hierarchical Accounts & Consolidated View Engine
 *
 * Pure read-only analytical module (Calculated View):
 * - Computes consolidated balances (direct + all descendants at arbitrary depth)
 * - Cycle-guarded traversals (visited Set) to prevent infinite recursion
 * - Pre-indexed / memoized HierarchyIndex for O(N + M) performance
 * - Never modifies AccountModel, TransactionModel, or core direct-balance totals
 */

import { AccountModel, CategoryModel, TransactionModel } from './types.ts';
import { compareTransactions, getSignedTransactionMinor } from './balance_calculator.ts';
import {
  AccountPeriodMetrics,
  calculateHistoricalBalanceAt,
  computeAccountPeriodMetrics,
  isReportRelevantAccount,
  matchesPublicSearchTerms,
  NormalizedReportScope,
  normalizeReportScope,
  ReportFilterOptions,
  validateReportScopeDates,
} from './financial_reports.ts';

export type HierarchyStatusScope = 'all' | 'active' | 'archived';

export interface HierarchicalAccountNode {
  account: AccountModel;
  level: number;
  parentName: string | null;
  path: string[];
  hierarchicalPath: string;
}

export interface ConsolidatedBranchBreakdown {
  account: AccountModel;
  level: number;
  parentName: string | null;
  hierarchicalPath: string;
  originalOpeningBalanceMinor: number;
  openingBalanceMinor: number; // Opening at period start (original opening + pre-fromDate movements)
  openingAtPeriodMinor: number;
  periodOwedByMinor: number;
  periodOwedToMinor: number;
  periodNetMovementMinor: number;
  directBalanceMinor: number;
  consolidatedBalanceMinor: number;
  descendantCount: number;
}

export interface ConsolidatedStatementRow {
  transaction: TransactionModel;
  sourceAccountId: string;
  sourceAccountName: string;
  hierarchicalPath: string;
  signedAmountMinor: number;
  runningConsolidatedBalanceMinor: number;
}

export interface ConsolidatedStatementResult {
  rootAccount: AccountModel;
  fromDate?: string;
  toDate?: string;
  statusScope: HierarchyStatusScope;
  descendantIds: string[];
  descendantCount: number;
  subtreeAccountIds: string[];
  openingConsolidatedBalanceMinor: number;
  closingConsolidatedBalanceMinor: number;
  totalOwedByMinor: number;
  totalOwedToMinor: number;
  netPeriodMovementMinor: number;
  directBalanceMinor: number;
  descendantsDirectSumMinor: number;
  rows: ConsolidatedStatementRow[];
  branchBreakdown: ConsolidatedBranchBreakdown[];
}

export interface HierarchicalAccountsReportRow {
  account: AccountModel;
  categoryName: string;
  parentName: string | null;
  level: number;
  hierarchicalPath: string;
  isParent: boolean;
  isTrueRoot: boolean;
  hasExcludedParent: boolean;
  directChildrenCount: number;
  descendantCount: number;
  originalOpeningBalanceMinor: number;
  openingAtPeriodMinor: number;
  directOpeningMinor: number; // Alias of openingAtPeriodMinor for true Opening + Movements = Closing equation
  directOwedByMinor: number;
  directOwedToMinor: number;
  directNetMovementMinor: number;
  directBalanceMinor: number;
  consolidatedOpeningAtPeriodMinor: number;
  consolidatedOwedByMinor: number;
  consolidatedOwedToMinor: number;
  consolidatedNetMovementMinor: number;
  consolidatedChildrenOnlyMinor: number;
  consolidatedBalanceMinor: number;
  periodTransactionCount: number;
  lastTransactionDate: string | null;
  lastTransactionAmountMinor: number | null;
  directBalanceType: 'receivable' | 'payable' | 'balanced';
  consolidatedBalanceType: 'receivable' | 'payable' | 'balanced';
  isSearchMatch?: boolean;
  isSearchContextOnly?: boolean;
}

export interface RootAccountSummary {
  account: AccountModel;
  categoryName: string;
  hierarchicalPath: string;
  directChildrenCount: number;
  descendantCount: number;
  consolidatedOpeningAtPeriodMinor: number;
  consolidatedOwedByMinor: number;
  consolidatedOwedToMinor: number;
  consolidatedNetMovementMinor: number;
  directBalanceMinor: number;
  consolidatedChildrenOnlyMinor: number;
  consolidatedBalanceMinor: number;
  consolidatedBalanceType: 'receivable' | 'payable' | 'balanced';
}

export interface ReportPeriodMovementRow {
  transaction: TransactionModel;
  accountName: string;
  hierarchicalPath: string;
  signedAmountMinor: number;
  cumulativeRunningMinor: number;
}

export interface HierarchicalExecutiveSummary {
  totalDirectReceivableMinor: number;
  totalDirectPayableMinor: number;
  netDirectBalanceMinor: number;
  totalOpeningAtPeriodMinor: number;
  totalPeriodOwedByMinor: number;
  totalPeriodOwedToMinor: number;
  totalPeriodNetMovementMinor: number;
  totalClosingDirectBalanceMinor: number;
  accountsCount: number;
  rootAccountsCount: number;
  branchAccountsCount: number;
  accountsWithActivityCount: number;
}

export interface PeriodOperationsSummary {
  transactionsCount: number;
  totalOwedByMinor: number;
  totalOwedToMinor: number;
  periodNetChangeMinor: number;
  largestTransactionMinor: number;
  largestTransactionDescription: string | null;
  largestTransactionAccountName: string | null;
  averageTransactionMinor: number;
  accountsWithActivityCount: number;
}

export interface BalancesAnalyticsSummary {
  receivableAccountsCount: number;
  payableAccountsCount: number;
  balancedAccountsCount: number;
  top5Debtors: HierarchicalAccountsReportRow[];
  top5Creditors: HierarchicalAccountsReportRow[];
  top5RootsByConsolidated: RootAccountSummary[];
}

export interface FinancialAnalysisSummary {
  top10Debtors: HierarchicalAccountsReportRow[];
  top10Creditors: HierarchicalAccountsReportRow[];
  top10RootsByConsolidated: RootAccountSummary[];
  balancedAccounts: HierarchicalAccountsReportRow[];
  zeroMovementAccounts: HierarchicalAccountsReportRow[]; // Zero movement BUT non-zero balance (dormant 0/0/0 excluded)
  settledAccounts: HierarchicalAccountsReportRow[]; // periodTransactionCount > 0 AND directBalanceMinor === 0
}

export interface HierarchicalAccountsReport {
  validationError?: string;
  appliedScope: NormalizedReportScope;
  rows: HierarchicalAccountsReportRow[];
  allScopedRows: HierarchicalAccountsReportRow[];
  totalDirectReceivableMinor: number; // Direct only — NO double counting
  totalDirectPayableMinor: number; // Direct only — NO double counting
  netDirectBalanceMinor: number; // Direct only — NO double counting
  totalOpeningAtPeriodMinor: number; // Direct opening at fromDate — NO double counting
  totalPeriodOwedByMinor: number;
  totalPeriodOwedToMinor: number;
  totalPeriodNetMovementMinor: number;
  totalClosingDirectBalanceMinor: number;
  rootAccountsCount: number;
  branchAccountsCount: number;
  parentAccountsCount: number;
  totalAccountsCount: number;
  totalScopedAccountsCount: number;
  excludedDormantCount: number;
  searchMatchCount: number;
  executiveSummary: HierarchicalExecutiveSummary;
  periodOperations: PeriodOperationsSummary;
  balancesSummary: BalancesAnalyticsSummary;
  rootSummaries: RootAccountSummary[];
  financialAnalysis: FinancialAnalysisSummary;
  movements: ReportPeriodMovementRow[];
}

export type ParentAccountReportMode = 'summary' | 'detailed';

export interface SelectableParentAccount {
  account: AccountModel;
  directChildrenCount: number;
  totalDescendantsCount: number;
  hierarchicalPath: string;
}

export interface ParentAccountPeriodRow {
  id: string;
  account: AccountModel;
  rowKind: 'consolidated_summary' | 'direct_root' | 'branch';
  displayName: string;
  accountTypeLabel: 'رئيسي مجمع' | 'مباشر على الرئيسي' | 'فرعي رئيسي' | 'فرعي';
  categoryName: string;
  level: number;
  parentName: string | null;
  hierarchicalPath: string;
  openingAtPeriodMinor: number;
  owedByMinor: number;
  owedToMinor: number;
  netMovementMinor: number;
  closingBalanceMinor: number;
  periodTransactionCount: number;
  balanceType: 'receivable' | 'payable' | 'settled' | 'balanced';
  balanceTypeLabel: 'لك' | 'عليك' | 'تمت التسوية' | 'متزن';
  hasSubBranches: boolean;
  descendantCount: number;
}

export interface ParentAccountPeriodSummary {
  openingAtPeriodMinor: number;
  owedByMinor: number;
  owedToMinor: number;
  netMovementMinor: number;
  closingBalanceMinor: number;
  periodTransactionCount: number;
  balanceType: 'receivable' | 'payable' | 'settled' | 'balanced';
  balanceTypeLabel: 'لك' | 'عليك' | 'تمت التسوية' | 'متزن';
  directChildrenCount: number;
  activeBranchesCount: number;
  totalDescendantsInScopeCount: number;
  hasDirectRootActivity: boolean;
}

export interface ParentAccountPeriodReportOptions extends ReportFilterOptions {
  mode?: ParentAccountReportMode;
}

export interface ParentAccountPeriodReport {
  validationError?: string;
  rootAccount: AccountModel | null;
  appliedScope: NormalizedReportScope;
  mode: ParentAccountReportMode;
  summary: ParentAccountPeriodSummary;
  directRootMetrics: AccountPeriodMetrics | null;
  summaryRow: ParentAccountPeriodRow | null;
  directRootRow: ParentAccountPeriodRow | null;
  branchRows: ParentAccountPeriodRow[];
  detailRows: ParentAccountPeriodRow[];
  allRows: ParentAccountPeriodRow[];
  movements: ReportPeriodMovementRow[];
  excludedDormantCount: number;
}

export interface HierarchyIndex {
  accounts: AccountModel[];
  accountMap: Map<string, AccountModel>;
  childrenMap: Map<string, AccountModel[]>;
  transactionsByAccount: Map<string, TransactionModel[]>;
  toDate?: string;
  getDirectChildren: (accountId: string) => AccountModel[];
  isParent: (accountId: string) => boolean;
  getDescendantIds: (accountId: string) => string[];
  getSubtreeIds: (accountId: string) => string[];
  getDirectBalance: (accountId: string) => number;
  getConsolidatedBalance: (accountId: string) => number;
  getDepth: (accountId: string) => number;
  getPathNames: (accountId: string) => string[];
  getFormattedPath: (accountId: string, separator?: string) => string;
}

export function filterAccountsByStatusScope(
  accounts: AccountModel[],
  statusScope: HierarchyStatusScope = 'all'
): AccountModel[] {
  if (statusScope === 'active') {
    return accounts.filter((a) => a.status === 'active');
  }
  if (statusScope === 'archived') {
    return accounts.filter((a) => a.status === 'archived');
  }
  return accounts;
}

function getAccountMap(accountsOrMap: AccountModel[] | Map<string, AccountModel>): Map<string, AccountModel> {
  if (accountsOrMap instanceof Map) return accountsOrMap;
  return new Map(accountsOrMap.map((a) => [a.id, a]));
}

/**
 * Builds parentId -> direct children map preserving account order.
 */
export function buildChildrenMap(accounts: AccountModel[]): Map<string, AccountModel[]> {
  const childrenMap = new Map<string, AccountModel[]>();
  for (const acc of accounts) {
    if (acc.parentId && acc.parentId !== acc.id) {
      const list = childrenMap.get(acc.parentId);
      if (list) {
        list.push(acc);
      } else {
        childrenMap.set(acc.parentId, [acc]);
      }
    }
  }
  return childrenMap;
}

function isHierarchyIndex(value: unknown): value is HierarchyIndex {
  return (
    typeof value === 'object' &&
    value !== null &&
    'childrenMap' in value &&
    'getConsolidatedBalance' in value
  );
}

/**
 * Creates a memoized HierarchyIndex for fast O(N + M) hierarchy queries across UI & reports.
 */
export function createHierarchyIndex(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  toDate?: string
): HierarchyIndex {
  const accountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const childrenMap = buildChildrenMap(accounts);
  const transactionsByAccount = new Map<string, TransactionModel[]>();

  for (const tx of transactions) {
    const list = transactionsByAccount.get(tx.accountId);
    if (list) {
      list.push(tx);
    } else {
      transactionsByAccount.set(tx.accountId, [tx]);
    }
  }

  const directBalanceCache = new Map<string, number>();
  const descendantIdsCache = new Map<string, string[]>();
  const consolidatedBalanceCache = new Map<string, number>();
  const depthCache = new Map<string, number>();
  const pathCache = new Map<string, string[]>();

  const getDirectChildren = (accountId: string): AccountModel[] => {
    return childrenMap.get(accountId) || [];
  };

  const isParent = (accountId: string): boolean => {
    return (childrenMap.get(accountId)?.length || 0) > 0;
  };

  const getDescendantIds = (accountId: string): string[] => {
    const cached = descendantIdsCache.get(accountId);
    if (cached) return cached;

    const result: string[] = [];
    const visited = new Set<string>([accountId]);
    const queue: AccountModel[] = [...(childrenMap.get(accountId) || [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      result.push(current.id);

      const kids = childrenMap.get(current.id);
      if (kids && kids.length > 0) {
        for (const kid of kids) {
          if (!visited.has(kid.id)) {
            queue.push(kid);
          }
        }
      }
    }

    descendantIdsCache.set(accountId, result);
    return result;
  };

  const getSubtreeIds = (accountId: string): string[] => {
    if (!accountMap.has(accountId)) return [];
    return [accountId, ...getDescendantIds(accountId)];
  };

  const getDirectBalance = (accountId: string): number => {
    const cached = directBalanceCache.get(accountId);
    if (cached !== undefined) return cached;

    const acc = accountMap.get(accountId);
    if (!acc) return 0;

    const accTxs = transactionsByAccount.get(accountId) || [];
    let movementsTotal = 0;
    for (const tx of accTxs) {
      if (toDate && tx.date > toDate) continue;
      movementsTotal += getSignedTransactionMinor(tx.entryType, tx.amountMinor);
    }

    const bal = acc.openingBalanceMinor + movementsTotal;
    directBalanceCache.set(accountId, bal);
    return bal;
  };

  const computeConsolidated = (accountId: string, activeStack: Set<string>): number => {
    const cached = consolidatedBalanceCache.get(accountId);
    if (cached !== undefined) return cached;

    if (!accountMap.has(accountId) || activeStack.has(accountId)) {
      return 0;
    }

    activeStack.add(accountId);
    let total = getDirectBalance(accountId);
    const children = childrenMap.get(accountId) || [];
    for (const child of children) {
      if (!activeStack.has(child.id)) {
        total += computeConsolidated(child.id, activeStack);
      }
    }
    activeStack.delete(accountId);

    consolidatedBalanceCache.set(accountId, total);
    return total;
  };

  const getConsolidatedBalance = (accountId: string): number => {
    const cached = consolidatedBalanceCache.get(accountId);
    if (cached !== undefined) return cached;
    return computeConsolidated(accountId, new Set<string>());
  };

  const getPathNames = (accountId: string): string[] => {
    const cached = pathCache.get(accountId);
    if (cached) return cached;

    const names: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = accountId;

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const acc = accountMap.get(currentId);
      if (!acc) break;
      names.unshift(acc.name);
      currentId = acc.parentId;
    }

    pathCache.set(accountId, names);
    depthCache.set(accountId, Math.max(0, names.length - 1));
    return names;
  };

  const getDepth = (accountId: string): number => {
    const cached = depthCache.get(accountId);
    if (cached !== undefined) return cached;
    const names = getPathNames(accountId);
    return Math.max(0, names.length - 1);
  };

  const getFormattedPath = (accountId: string, separator = ' > '): string => {
    return getPathNames(accountId).join(separator);
  };

  return {
    accounts,
    accountMap,
    childrenMap,
    transactionsByAccount,
    toDate,
    getDirectChildren,
    isParent,
    getDescendantIds,
    getSubtreeIds,
    getDirectBalance,
    getConsolidatedBalance,
    getDepth,
    getPathNames,
    getFormattedPath,
  };
}

/**
 * Returns direct child accounts for a given parent account.
 */
export function getDirectChildren(
  accountId: string,
  accountsOrIndex: AccountModel[] | HierarchyIndex
): AccountModel[] {
  if (isHierarchyIndex(accountsOrIndex)) {
    return accountsOrIndex.getDirectChildren(accountId);
  }
  return accountsOrIndex.filter((a) => a.parentId === accountId && a.id !== accountId);
}

/**
 * Returns true if the account has at least one direct child.
 */
export function isParentAccount(
  accountId: string,
  accountsOrIndex: AccountModel[] | HierarchyIndex
): boolean {
  if (isHierarchyIndex(accountsOrIndex)) {
    return accountsOrIndex.isParent(accountId);
  }
  return accountsOrIndex.some((a) => a.parentId === accountId && a.id !== accountId);
}

/**
 * Returns all descendant account IDs (children, grandchildren, ...) excluding accountId itself.
 * Protected against circular references via visited Set.
 */
export function getDescendantAccountIds(
  accountId: string,
  accountsOrIndex: AccountModel[] | HierarchyIndex
): string[] {
  if (isHierarchyIndex(accountsOrIndex)) {
    return accountsOrIndex.getDescendantIds(accountId);
  }

  const childrenMap = buildChildrenMap(accountsOrIndex);
  const result: string[] = [];
  const visited = new Set<string>([accountId]);
  const queue: AccountModel[] = [...(childrenMap.get(accountId) || [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    result.push(current.id);
    const kids = childrenMap.get(current.id);
    if (kids) {
      for (const kid of kids) {
        if (!visited.has(kid.id)) {
          queue.push(kid);
        }
      }
    }
  }

  return result;
}

/**
 * Returns accountId followed by all descendant account IDs.
 */
export function getSubtreeAccountIds(
  accountId: string,
  accountsOrIndex: AccountModel[] | HierarchyIndex
): string[] {
  if (isHierarchyIndex(accountsOrIndex)) {
    return accountsOrIndex.getSubtreeIds(accountId);
  }
  const exists = accountsOrIndex.some((a) => a.id === accountId);
  if (!exists) return [];
  return [accountId, ...getDescendantAccountIds(accountId, accountsOrIndex)];
}

/**
 * Returns account path names from root down to the account (cycle-guarded).
 */
export function getAccountPath(
  accountId: string,
  accountsOrMap: AccountModel[] | Map<string, AccountModel>
): string[] {
  const accountMap = getAccountMap(accountsOrMap);
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = accountId;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const acc = accountMap.get(currentId);
    if (!acc) break;
    path.unshift(acc.name);
    currentId = acc.parentId;
  }

  return path;
}

/**
 * Formats full hierarchical path as a string (e.g. "شركة أ > فرع الرياض > مندوب 1").
 */
export function formatAccountPath(
  accountId: string,
  accountsOrMap: AccountModel[] | Map<string, AccountModel>,
  separator = ' > '
): string {
  return getAccountPath(accountId, accountsOrMap).join(separator);
}

/**
 * Returns nesting depth (0 for root, 1 for direct child, etc.), cycle-guarded.
 */
export function getAccountDepth(
  accountId: string,
  accountsOrMap: AccountModel[] | Map<string, AccountModel>
): number {
  const path = getAccountPath(accountId, accountsOrMap);
  return Math.max(0, path.length - 1);
}

/**
 * Calculates Consolidated Balance for an account (direct balance + direct balances of ALL scoped descendants).
 * Strictly a read-only Calculated View.
 */
export function calculateConsolidatedBalance(
  accountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  indexOrScope?: HierarchyIndex | HierarchyStatusScope,
  statusScope?: HierarchyStatusScope
): number {
  const resolvedScope: HierarchyStatusScope =
    typeof indexOrScope === 'string' ? indexOrScope : statusScope ?? 'all';
  const index = typeof indexOrScope === 'object' && indexOrScope !== null ? indexOrScope : undefined;

  if (index && !index.toDate && resolvedScope === 'all') {
    return index.getConsolidatedBalance(accountId);
  }

  const scopedAccounts = filterAccountsByStatusScope(accounts, resolvedScope);
  const accountMap = new Map<string, AccountModel>(scopedAccounts.map((a) => [a.id, a]));
  if (!accountMap.has(accountId)) return 0;

  const subtreeIds = getSubtreeAccountIds(accountId, scopedAccounts);
  let total = 0;
  for (const id of subtreeIds) {
    const acc = accountMap.get(id);
    if (acc) {
      total += calculateHistoricalBalanceAt(acc, transactions);
    }
  }
  return total;
}

/**
 * Calculates Historical Consolidated Balance for an account up to optional toDate (YYYY-MM-DD).
 * Excludes any transaction with date > toDate across both parent and all scoped descendants.
 */
export function calculateHistoricalConsolidatedBalance(
  accountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  toDate?: string,
  indexOrScope?: HierarchyIndex | HierarchyStatusScope,
  statusScope?: HierarchyStatusScope
): number {
  const resolvedScope: HierarchyStatusScope =
    typeof indexOrScope === 'string' ? indexOrScope : statusScope ?? 'all';
  const index = typeof indexOrScope === 'object' && indexOrScope !== null ? indexOrScope : undefined;

  if (index && index.toDate === toDate && resolvedScope === 'all') {
    return index.getConsolidatedBalance(accountId);
  }

  const scopedAccounts = filterAccountsByStatusScope(accounts, resolvedScope);
  const accountMap = new Map<string, AccountModel>(scopedAccounts.map((a) => [a.id, a]));
  if (!accountMap.has(accountId)) return 0;

  const subtreeIds = getSubtreeAccountIds(accountId, scopedAccounts);
  let total = 0;
  for (const id of subtreeIds) {
    const acc = accountMap.get(id);
    if (acc) {
      total += calculateHistoricalBalanceAt(acc, transactions, toDate);
    }
  }
  return total;
}

/**
 * Flattens accounts in depth-first tree order (Root -> Children -> Grandchildren),
 * safely handling orphans and circular links.
 */
export function flattenAccountsInTreeOrder(accounts: AccountModel[]): HierarchicalAccountNode[] {
  const accountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const childrenMap = buildChildrenMap(accounts);
  const visited = new Set<string>();
  const result: HierarchicalAccountNode[] = [];

  const roots = accounts.filter((a) => !a.parentId || !accountMap.has(a.parentId));

  const visit = (acc: AccountModel, level: number, parentPath: string[], parentName: string | null) => {
    if (visited.has(acc.id)) return;
    visited.add(acc.id);

    const path = [...parentPath, acc.name];
    result.push({
      account: acc,
      level,
      parentName,
      path,
      hierarchicalPath: path.join(' > '),
    });

    const children = childrenMap.get(acc.id) || [];
    for (const child of children) {
      visit(child, level + 1, path, acc.name);
    }
  };

  for (const root of roots) {
    visit(root, 0, [], null);
  }

  // Fallback in case a disconnected cycle existed with no root
  for (const acc of accounts) {
    if (!visited.has(acc.id)) {
      const parent = acc.parentId ? accountMap.get(acc.parentId) : undefined;
      visit(acc, 0, [], parent ? parent.name : null);
    }
  }

  return result;
}

/**
 * Calculates Consolidated Account Statement for a root/parent account across its scoped subtree.
 * - Opening consolidated balance = Σ openingBalanceMinor(subtree) + Σ signedTx(subtree, date < fromDate)
 * - Period rows = all transactions of subtree within [fromDate, toDate] sorted stably
 * - Sequential running consolidated balance
 */
export function calculateConsolidatedStatement(
  rootAccountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  fromDate?: string,
  toDate?: string,
  statusScope: HierarchyStatusScope = 'all'
): ConsolidatedStatementResult {
  const fullRoot = accounts.find((a) => a.id === rootAccountId);
  if (!fullRoot) {
    throw new Error(`الحساب غير موجود: ${rootAccountId}`);
  }

  // Filter descendants according to statusScope while always keeping rootAccount itself accessible
  const scopedAccounts =
    statusScope === 'all'
      ? accounts
      : accounts.filter((a) => a.id === rootAccountId || a.status === statusScope);

  const index = createHierarchyIndex(scopedAccounts, transactions, toDate);
  const rootAccount = index.accountMap.get(rootAccountId) || fullRoot;

  const descendantIds = index.getDescendantIds(rootAccountId);
  const subtreeAccountIds = [rootAccountId, ...descendantIds];
  const subtreeSet = new Set<string>(subtreeAccountIds);

  // Opening balance at fromDate across the entire subtree (and pre-period delta per account)
  let openingConsolidatedBalanceMinor = 0;
  const prePeriodDeltaByAccount = new Map<string, number>();

  for (const id of subtreeAccountIds) {
    const acc = index.accountMap.get(id);
    if (acc) {
      openingConsolidatedBalanceMinor += acc.openingBalanceMinor;
    }
  }

  const subtreeTxs = transactions
    .filter((t) => subtreeSet.has(t.accountId))
    .sort(compareTransactions);

  const periodTxs: TransactionModel[] = [];
  for (const t of subtreeTxs) {
    if (fromDate && t.date < fromDate) {
      const signed = getSignedTransactionMinor(t.entryType, t.amountMinor);
      openingConsolidatedBalanceMinor += signed;
      prePeriodDeltaByAccount.set(t.accountId, (prePeriodDeltaByAccount.get(t.accountId) || 0) + signed);
    } else if (toDate && t.date > toDate) {
      continue;
    } else {
      periodTxs.push(t);
    }
  }

  let runningBalance = openingConsolidatedBalanceMinor;
  let totalOwedByMinor = 0;
  let totalOwedToMinor = 0;

  const periodOwedByByAccount = new Map<string, number>();
  const periodOwedToByAccount = new Map<string, number>();

  const rows: ConsolidatedStatementRow[] = periodTxs.map((t) => {
    const signedDelta = getSignedTransactionMinor(t.entryType, t.amountMinor);
    if (t.entryType === 'owedByAccount') {
      totalOwedByMinor += t.amountMinor;
      periodOwedByByAccount.set(t.accountId, (periodOwedByByAccount.get(t.accountId) || 0) + t.amountMinor);
    } else {
      totalOwedToMinor += t.amountMinor;
      periodOwedToByAccount.set(t.accountId, (periodOwedToByAccount.get(t.accountId) || 0) + t.amountMinor);
    }
    runningBalance += signedDelta;

    const sourceAcc = index.accountMap.get(t.accountId);
    return {
      transaction: t,
      sourceAccountId: t.accountId,
      sourceAccountName: sourceAcc?.name || 'حساب غير معروف',
      hierarchicalPath: index.getFormattedPath(t.accountId),
      signedAmountMinor: signedDelta,
      runningConsolidatedBalanceMinor: runningBalance,
    };
  });

  // Build branch breakdown in tree order rooted at rootAccount
  const orderedSubtreeNodes = flattenAccountsInTreeOrder(
    subtreeAccountIds
      .map((id) => index.accountMap.get(id)!)
      .filter(Boolean)
  );

  const branchBreakdown: ConsolidatedBranchBreakdown[] = orderedSubtreeNodes.map((node) => {
    const parentAcc = node.account.parentId ? index.accountMap.get(node.account.parentId) : undefined;
    const originalOpeningBalanceMinor = node.account.openingBalanceMinor;
    const openingAtPeriodMinor = originalOpeningBalanceMinor + (prePeriodDeltaByAccount.get(node.account.id) || 0);
    const owedBy = periodOwedByByAccount.get(node.account.id) || 0;
    const owedTo = periodOwedToByAccount.get(node.account.id) || 0;

    return {
      account: node.account,
      level: index.getDepth(node.account.id),
      parentName: parentAcc ? parentAcc.name : null,
      hierarchicalPath: index.getFormattedPath(node.account.id),
      originalOpeningBalanceMinor,
      openingBalanceMinor: openingAtPeriodMinor,
      openingAtPeriodMinor,
      periodOwedByMinor: owedBy,
      periodOwedToMinor: owedTo,
      periodNetMovementMinor: owedBy - owedTo,
      directBalanceMinor: index.getDirectBalance(node.account.id),
      consolidatedBalanceMinor: index.getConsolidatedBalance(node.account.id),
      descendantCount: index.getDescendantIds(node.account.id).length,
    };
  });

  const directBalanceMinor = index.getDirectBalance(rootAccountId);
  const consolidatedTotal = index.getConsolidatedBalance(rootAccountId);

  return {
    rootAccount,
    fromDate,
    toDate,
    statusScope,
    descendantIds,
    descendantCount: descendantIds.length,
    subtreeAccountIds,
    openingConsolidatedBalanceMinor,
    closingConsolidatedBalanceMinor: runningBalance,
    totalOwedByMinor,
    totalOwedToMinor,
    netPeriodMovementMinor: totalOwedByMinor - totalOwedToMinor,
    directBalanceMinor,
    descendantsDirectSumMinor: consolidatedTotal - directBalanceMinor,
    rows,
    branchBreakdown,
  };
}

function classifyBalanceType(balanceMinor: number): 'receivable' | 'payable' | 'balanced' {
  if (balanceMinor > 0) return 'receivable';
  if (balanceMinor < 0) return 'payable';
  return 'balanced';
}

/**
 * Generates Hierarchical Accounts & Executive Financial Report (الحسابات الرئيسية والفروع).
 * Enforces strict scope, zero-dormant exclusion, and search isolation:
 * - Date Guard: returns validationError when fromDate > toDate.
 * - Financial Scope FIRST: filters accounts by BOTH status AND categoryId before building
 *   HierarchyIndex so archived or cross-category descendants NEVER invisibly contribute to
 *   consolidated balances.
 * - Active Child under Excluded Parent: retains full hierarchicalPath & parentName, and sets
 *   isTrueRoot = false (never miscounted as a root account).
 * - Central Zero-Dormant Helper (`isReportRelevantAccount`): keeps any account with
 *   opening != 0 OR closing != 0 OR periodTx > 0, plus any parent whose scoped subtree has at
 *   least one relevant node; hides completely dormant trees (0/0/0 throughout).
 * - Search Within Results: preserves matching nodes AND their scoped ancestors without changing
 *   any financial total, count, root summary, or movement summary.
 */
export function generateHierarchicalAccountsReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  options: ReportFilterOptions = {}
): HierarchicalAccountsReport {
  const scope = normalizeReportScope(options, 'all');
  const validation = validateReportScopeDates(scope);

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      appliedScope: scope,
      rows: [],
      allScopedRows: [],
      totalDirectReceivableMinor: 0,
      totalDirectPayableMinor: 0,
      netDirectBalanceMinor: 0,
      totalOpeningAtPeriodMinor: 0,
      totalPeriodOwedByMinor: 0,
      totalPeriodOwedToMinor: 0,
      totalPeriodNetMovementMinor: 0,
      totalClosingDirectBalanceMinor: 0,
      rootAccountsCount: 0,
      branchAccountsCount: 0,
      parentAccountsCount: 0,
      totalAccountsCount: 0,
      totalScopedAccountsCount: 0,
      excludedDormantCount: 0,
      searchMatchCount: 0,
      executiveSummary: {
        totalDirectReceivableMinor: 0,
        totalDirectPayableMinor: 0,
        netDirectBalanceMinor: 0,
        totalOpeningAtPeriodMinor: 0,
        totalPeriodOwedByMinor: 0,
        totalPeriodOwedToMinor: 0,
        totalPeriodNetMovementMinor: 0,
        totalClosingDirectBalanceMinor: 0,
        accountsCount: 0,
        rootAccountsCount: 0,
        branchAccountsCount: 0,
        accountsWithActivityCount: 0,
      },
      periodOperations: {
        transactionsCount: 0,
        totalOwedByMinor: 0,
        totalOwedToMinor: 0,
        periodNetChangeMinor: 0,
        largestTransactionMinor: 0,
        largestTransactionDescription: null,
        largestTransactionAccountName: null,
        averageTransactionMinor: 0,
        accountsWithActivityCount: 0,
      },
      balancesSummary: {
        receivableAccountsCount: 0,
        payableAccountsCount: 0,
        balancedAccountsCount: 0,
        top5Debtors: [],
        top5Creditors: [],
        top5RootsByConsolidated: [],
      },
      rootSummaries: [],
      financialAnalysis: {
        top10Debtors: [],
        top10Creditors: [],
        top10RootsByConsolidated: [],
        balancedAccounts: [],
        zeroMovementAccounts: [],
        settledAccounts: [],
      },
      movements: [],
    };
  }

  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const knownCategoryIds = new Set<string>(categories.map((c) => c.id));
  const fullAccountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));

  // Financial Scope: filter by BOTH status AND categoryId BEFORE HierarchyIndex construction
  // so no excluded child can invisibly inflate consolidated totals.
  const financialScopedAccounts = filterAccountsByStatusScope(accounts, scope.status).filter((acc) => {
    if (!scope.categoryId || scope.categoryId === 'all') return true;
    if (scope.categoryId === 'uncategorized') {
      return !knownCategoryIds.has(acc.categoryId);
    }
    return acc.categoryId === scope.categoryId;
  });

  const scopedAccountMap = new Map<string, AccountModel>(
    financialScopedAccounts.map((a) => [a.id, a])
  );
  const index = createHierarchyIndex(financialScopedAccounts, transactions, scope.toDate);
  const treeNodes = flattenAccountsInTreeOrder(financialScopedAccounts);

  // Precompute direct period metrics via shared central calculator
  const directMetricsMap = new Map<string, AccountPeriodMetrics>();
  for (const acc of financialScopedAccounts) {
    const accTxs = index.transactionsByAccount.get(acc.id) || [];
    directMetricsMap.set(
      acc.id,
      computeAccountPeriodMetrics(acc, accTxs, scope.fromDate, scope.toDate)
    );
  }

  // Mandatory Zero-Dormant + Parent Subtree Rule (#1 & #2):
  // An account stays in the report iff it OR any descendant in the scoped subtree passes isReportRelevantAccount().
  const relevantIdSet = new Set<string>();
  let excludedDormantCount = 0;

  for (const node of treeNodes) {
    const subtreeIds = index.getSubtreeIds(node.account.id);
    const hasRelevantInSubtree = subtreeIds.some((subId) => {
      const m = directMetricsMap.get(subId);
      return m ? isReportRelevantAccount(m) : false;
    });
    if (hasRelevantInSubtree) {
      relevantIdSet.add(node.account.id);
    } else {
      excludedDormantCount++;
    }
  }

  const relevantTreeNodes = treeNodes.filter((n) => relevantIdSet.has(n.account.id));

  let totalDirectReceivableMinor = 0;
  let totalDirectPayableMinor = 0;
  let totalOpeningAtPeriodMinor = 0;
  let totalPeriodOwedByMinor = 0;
  let totalPeriodOwedToMinor = 0;
  let rootAccountsCount = 0;
  let branchAccountsCount = 0;
  let parentAccountsCount = 0;
  let accountsWithActivityCount = 0;
  let receivableAccountsCount = 0;
  let payableAccountsCount = 0;
  let balancedAccountsCount = 0;

  const allScopedRows: HierarchicalAccountsReportRow[] = relevantTreeNodes.map((node) => {
    const acc = node.account;
    const direct = directMetricsMap.get(acc.id)!;
    const subtreeIds = index.getSubtreeIds(acc.id).filter((id) => relevantIdSet.has(id));
    const descendantIds = index.getDescendantIds(acc.id).filter((id) => relevantIdSet.has(id));
    const directChildrenCount = index
      .getDirectChildren(acc.id)
      .filter((child) => relevantIdSet.has(child.id)).length;

    let consolidatedOpeningAtPeriodMinor = 0;
    let consolidatedOwedByMinor = 0;
    let consolidatedOwedToMinor = 0;
    for (const subId of subtreeIds) {
      const subMetrics = directMetricsMap.get(subId);
      if (subMetrics) {
        consolidatedOpeningAtPeriodMinor += subMetrics.openingAtPeriodMinor;
        consolidatedOwedByMinor += subMetrics.directOwedByMinor;
        consolidatedOwedToMinor += subMetrics.directOwedToMinor;
      }
    }
    const consolidatedNetMovementMinor = consolidatedOwedByMinor - consolidatedOwedToMinor;
    const consolidatedBalanceMinor = consolidatedOpeningAtPeriodMinor + consolidatedNetMovementMinor;

    const descendantCount = descendantIds.length;
    const isParent = descendantCount > 0;
    const isTrueRoot = !acc.parentId;
    const hasExcludedParent = Boolean(
      acc.parentId && fullAccountMap.has(acc.parentId) && !scopedAccountMap.has(acc.parentId)
    );

    if (direct.closingBalanceMinor > 0) {
      totalDirectReceivableMinor += direct.closingBalanceMinor;
      receivableAccountsCount++;
    } else if (direct.closingBalanceMinor < 0) {
      totalDirectPayableMinor += Math.abs(direct.closingBalanceMinor);
      payableAccountsCount++;
    } else {
      balancedAccountsCount++;
    }

    totalOpeningAtPeriodMinor += direct.openingAtPeriodMinor;
    totalPeriodOwedByMinor += direct.directOwedByMinor;
    totalPeriodOwedToMinor += direct.directOwedToMinor;
    if (direct.periodTransactionCount > 0) {
      accountsWithActivityCount++;
    }

    if (isTrueRoot) {
      rootAccountsCount++;
    } else {
      branchAccountsCount++;
    }
    if (isParent) {
      parentAccountsCount++;
    }

    const realParent = acc.parentId ? fullAccountMap.get(acc.parentId) : undefined;
    const fullHierarchicalPath = formatAccountPath(acc.id, fullAccountMap) || node.hierarchicalPath;

    return {
      account: acc,
      categoryName: categoryMap.get(acc.categoryId) || 'غير مصنف',
      parentName: realParent ? realParent.name : null,
      level: node.level,
      hierarchicalPath: fullHierarchicalPath,
      isParent,
      isTrueRoot,
      hasExcludedParent,
      directChildrenCount,
      descendantCount,
      originalOpeningBalanceMinor: direct.originalOpeningBalanceMinor,
      openingAtPeriodMinor: direct.openingAtPeriodMinor,
      directOpeningMinor: direct.openingAtPeriodMinor,
      directOwedByMinor: direct.directOwedByMinor,
      directOwedToMinor: direct.directOwedToMinor,
      directNetMovementMinor: direct.directNetMovementMinor,
      directBalanceMinor: direct.closingBalanceMinor,
      consolidatedOpeningAtPeriodMinor,
      consolidatedOwedByMinor,
      consolidatedOwedToMinor,
      consolidatedNetMovementMinor,
      consolidatedChildrenOnlyMinor: consolidatedBalanceMinor - direct.closingBalanceMinor,
      consolidatedBalanceMinor,
      periodTransactionCount: direct.periodTransactionCount,
      lastTransactionDate: direct.lastTransactionDate,
      lastTransactionAmountMinor: direct.lastTransactionAmountMinor,
      directBalanceType: classifyBalanceType(direct.closingBalanceMinor),
      consolidatedBalanceType: classifyBalanceType(consolidatedBalanceMinor),
    };
  });

  const netDirectBalanceMinor = totalDirectReceivableMinor - totalDirectPayableMinor;
  const totalPeriodNetMovementMinor = totalPeriodOwedByMinor - totalPeriodOwedToMinor;
  const totalClosingDirectBalanceMinor = totalOpeningAtPeriodMinor + totalPeriodNetMovementMinor;

  // Build period movements across all financial-scoped relevant accounts (unaffected by searchQuery)
  const scopedRelevantIds = new Set(allScopedRows.map((r) => r.account.id));
  const sortedPeriodTxs = transactions
    .filter((t) => {
      if (!scopedRelevantIds.has(t.accountId)) return false;
      if (scope.fromDate && t.date < scope.fromDate) return false;
      if (scope.toDate && t.date > scope.toDate) return false;
      return true;
    })
    .sort(compareTransactions);

  let cumulativeRunningMinor = totalOpeningAtPeriodMinor;
  let largestTx: TransactionModel | null = null;
  let sumTxAbsMinor = 0;

  const movements: ReportPeriodMovementRow[] = sortedPeriodTxs.map((t) => {
    const signedAmountMinor = getSignedTransactionMinor(t.entryType, t.amountMinor);
    cumulativeRunningMinor += signedAmountMinor;
    sumTxAbsMinor += t.amountMinor;
    if (!largestTx || t.amountMinor > largestTx.amountMinor) {
      largestTx = t;
    }
    const acc = fullAccountMap.get(t.accountId);
    const hierarchicalPath = formatAccountPath(t.accountId, fullAccountMap) || acc?.name || 'حساب غير معروف';
    return {
      transaction: t,
      accountName: acc?.name || 'حساب غير معروف',
      hierarchicalPath,
      signedAmountMinor,
      cumulativeRunningMinor,
    };
  });

  // Root Accounts Summary: ONLY true root accounts (!parentId) — branches under excluded parents
  // NEVER impersonate roots (Section 7).
  const trueRootRows = allScopedRows.filter((r) => r.isTrueRoot);
  const rootSummaries: RootAccountSummary[] = trueRootRows.map((r) => ({
    account: r.account,
    categoryName: r.categoryName,
    hierarchicalPath: r.hierarchicalPath,
    directChildrenCount: r.directChildrenCount,
    descendantCount: r.descendantCount,
    consolidatedOpeningAtPeriodMinor: r.consolidatedOpeningAtPeriodMinor,
    consolidatedOwedByMinor: r.consolidatedOwedByMinor,
    consolidatedOwedToMinor: r.consolidatedOwedToMinor,
    consolidatedNetMovementMinor: r.consolidatedNetMovementMinor,
    directBalanceMinor: r.directBalanceMinor,
    consolidatedChildrenOnlyMinor: r.consolidatedChildrenOnlyMinor,
    consolidatedBalanceMinor: r.consolidatedBalanceMinor,
    consolidatedBalanceType: r.consolidatedBalanceType,
  }));

  const positiveSorted = allScopedRows
    .filter((r) => r.directBalanceMinor > 0)
    .sort((a, b) => b.directBalanceMinor - a.directBalanceMinor);
  const negativeSorted = allScopedRows
    .filter((r) => r.directBalanceMinor < 0)
    .sort((a, b) => a.directBalanceMinor - b.directBalanceMinor);
  const rootsByAbsConsolidated = [...rootSummaries].sort(
    (a, b) => Math.abs(b.consolidatedBalanceMinor) - Math.abs(a.consolidatedBalanceMinor)
  );
  const balancedAccounts = allScopedRows.filter((r) => r.directBalanceMinor === 0);
  // Section 13: Zero-movement analysis ONLY includes accounts holding a non-zero opening or closing balance
  const zeroMovementAccounts = allScopedRows.filter(
    (r) =>
      r.periodTransactionCount === 0 &&
      (r.openingAtPeriodMinor !== 0 || r.directBalanceMinor !== 0)
  );
  // Section 14: Accounts that had movements during the period and settled to 0
  const settledAccounts = allScopedRows.filter(
    (r) => r.periodTransactionCount > 0 && r.directBalanceMinor === 0
  );

  // Hierarchical Display Search (#4 & #5): Search Within Results keeping matching accounts + ancestors
  const searchTrimmed = options.searchQuery ? options.searchQuery.trim() : '';
  let visibleRows = allScopedRows;
  let searchMatchCount = allScopedRows.length;

  if (searchTrimmed !== '') {
    const matchedIds = new Set<string>();
    const visibleWithAncestorsIds = new Set<string>();

    for (const r of allScopedRows) {
      if (matchesPublicSearchTerms(r.account, searchTrimmed)) {
        matchedIds.add(r.account.id);
        visibleWithAncestorsIds.add(r.account.id);

        // Walk up ancestors within scopedRelevantIds (cycle-guarded)
        const visitedUp = new Set<string>([r.account.id]);
        let pId = r.account.parentId;
        while (pId && !visitedUp.has(pId)) {
          visitedUp.add(pId);
          if (scopedRelevantIds.has(pId)) {
            visibleWithAncestorsIds.add(pId);
          }
          pId = fullAccountMap.get(pId)?.parentId ?? null;
        }
      }
    }

    searchMatchCount = matchedIds.size;
    visibleRows = allScopedRows
      .filter((r) => visibleWithAncestorsIds.has(r.account.id))
      .map((r) => ({
        ...r,
        isSearchMatch: matchedIds.has(r.account.id),
        isSearchContextOnly: !matchedIds.has(r.account.id),
      }));
  }

  const largestAccount = largestTx
    ? fullAccountMap.get((largestTx as TransactionModel).accountId)
    : undefined;

  return {
    appliedScope: scope,
    rows: visibleRows,
    allScopedRows,
    totalDirectReceivableMinor,
    totalDirectPayableMinor,
    netDirectBalanceMinor,
    totalOpeningAtPeriodMinor,
    totalPeriodOwedByMinor,
    totalPeriodOwedToMinor,
    totalPeriodNetMovementMinor,
    totalClosingDirectBalanceMinor,
    rootAccountsCount,
    branchAccountsCount,
    parentAccountsCount,
    totalAccountsCount: allScopedRows.length,
    totalScopedAccountsCount: allScopedRows.length,
    excludedDormantCount,
    searchMatchCount,
    executiveSummary: {
      totalDirectReceivableMinor,
      totalDirectPayableMinor,
      netDirectBalanceMinor,
      totalOpeningAtPeriodMinor,
      totalPeriodOwedByMinor,
      totalPeriodOwedToMinor,
      totalPeriodNetMovementMinor,
      totalClosingDirectBalanceMinor,
      accountsCount: allScopedRows.length,
      rootAccountsCount,
      branchAccountsCount,
      accountsWithActivityCount,
    },
    periodOperations: {
      transactionsCount: movements.length,
      totalOwedByMinor: totalPeriodOwedByMinor,
      totalOwedToMinor: totalPeriodOwedToMinor,
      periodNetChangeMinor: totalPeriodNetMovementMinor,
      largestTransactionMinor: largestTx ? (largestTx as TransactionModel).amountMinor : 0,
      largestTransactionDescription: largestTx ? (largestTx as TransactionModel).description : null,
      largestTransactionAccountName: largestAccount ? largestAccount.name : null,
      averageTransactionMinor: movements.length > 0 ? Math.round(sumTxAbsMinor / movements.length) : 0,
      accountsWithActivityCount,
    },
    balancesSummary: {
      receivableAccountsCount,
      payableAccountsCount,
      balancedAccountsCount,
      top5Debtors: positiveSorted.slice(0, 5),
      top5Creditors: negativeSorted.slice(0, 5),
      top5RootsByConsolidated: rootsByAbsConsolidated.slice(0, 5),
    },
    rootSummaries,
    financialAnalysis: {
      top10Debtors: positiveSorted.slice(0, 10),
      top10Creditors: negativeSorted.slice(0, 10),
      top10RootsByConsolidated: rootsByAbsConsolidated.slice(0, 10),
      balancedAccounts,
      zeroMovementAccounts,
      settledAccounts,
    },
    movements,
  };
}

function classifyParentReportBalance(
  balanceMinor: number,
  periodTransactionCount: number
): {
  balanceType: 'receivable' | 'payable' | 'settled' | 'balanced';
  balanceTypeLabel: 'لك' | 'عليك' | 'تمت التسوية' | 'متزن';
} {
  if (balanceMinor > 0) {
    return { balanceType: 'receivable', balanceTypeLabel: 'لك' };
  }
  if (balanceMinor < 0) {
    return { balanceType: 'payable', balanceTypeLabel: 'عليك' };
  }
  if (periodTransactionCount > 0) {
    return { balanceType: 'settled', balanceTypeLabel: 'تمت التسوية' };
  }
  return { balanceType: 'balanced', balanceTypeLabel: 'متزن' };
}

/**
 * Returns ONLY accounts that actually have at least one child/descendant
 * within the requested status scope (leaf accounts without children are excluded).
 */
export function getSelectableParentAccounts(
  accounts: AccountModel[],
  statusScope: HierarchyStatusScope = 'all'
): SelectableParentAccount[] {
  const scoped = filterAccountsByStatusScope(accounts, statusScope);
  const fullMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const index = createHierarchyIndex(scoped, []);
  const treeOrdered = flattenAccountsInTreeOrder(scoped);

  const result: SelectableParentAccount[] = [];
  for (const node of treeOrdered) {
    const directChildren = index.getDirectChildren(node.account.id);
    if (directChildren.length === 0) continue;
    const descendants = index.getDescendantIds(node.account.id);
    result.push({
      account: node.account,
      directChildrenCount: directChildren.length,
      totalDescendantsCount: descendants.length,
      hierarchicalPath: formatAccountPath(node.account.id, fullMap) || node.account.name,
    });
  }
  return result;
}

/**
 * Generates Independent Parent Account & Branches Period Report (تقرير الحساب الرئيسي والفروع).
 * Single Source of Truth shared identically across Screen UI, Excel (.xlsx), and PDF:
 * - Consolidated Summary Row = direct root + all scoped relevant descendants (each counted ONCE).
 * - Preserves & surfaces direct activity on the Parent account via dedicated `directRootRow`
 *   when the parent itself has opening/closing != 0 or movements > 0.
 * - Multi-level arbitrary depth DFS ordering (level 1, 2, 3, ...) with cycle guard.
 * - Excludes Zero Dormant leaves (`0 / 0 tx / 0`), while keeping zero-direct parent/intermediate
 *   branches that have at least one relevant active descendant underneath.
 */
export function generateParentAccountPeriodReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  parentAccountId: string,
  options: ParentAccountPeriodReportOptions = {}
): ParentAccountPeriodReport {
  const scope = normalizeReportScope(options, 'all');
  const mode: ParentAccountReportMode = options.mode === 'summary' ? 'summary' : 'detailed';
  const validation = validateReportScopeDates(scope);

  const emptySummary: ParentAccountPeriodSummary = {
    openingAtPeriodMinor: 0,
    owedByMinor: 0,
    owedToMinor: 0,
    netMovementMinor: 0,
    closingBalanceMinor: 0,
    periodTransactionCount: 0,
    balanceType: 'balanced',
    balanceTypeLabel: 'متزن',
    directChildrenCount: 0,
    activeBranchesCount: 0,
    totalDescendantsInScopeCount: 0,
    hasDirectRootActivity: false,
  };

  if (!validation.valid) {
    return {
      validationError: validation.errorMessage,
      rootAccount: null,
      appliedScope: scope,
      mode,
      summary: emptySummary,
      directRootMetrics: null,
      summaryRow: null,
      directRootRow: null,
      branchRows: [],
      detailRows: [],
      allRows: [],
      movements: [],
      excludedDormantCount: 0,
    };
  }

  const scopedAccounts = filterAccountsByStatusScope(accounts, scope.status);
  const fullAccountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  const scopedAccountMap = new Map<string, AccountModel>(scopedAccounts.map((a) => [a.id, a]));
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));

  const rootAccount = scopedAccountMap.get(parentAccountId) || fullAccountMap.get(parentAccountId) || null;
  if (!rootAccount || !scopedAccountMap.has(rootAccount.id)) {
    return {
      rootAccount: null,
      appliedScope: scope,
      mode,
      summary: emptySummary,
      directRootMetrics: null,
      summaryRow: null,
      directRootRow: null,
      branchRows: [],
      detailRows: [],
      allRows: [],
      movements: [],
      excludedDormantCount: 0,
    };
  }

  const index = createHierarchyIndex(scopedAccounts, transactions, scope.toDate);
  const subtreeIdsInScope = index.getSubtreeIds(rootAccount.id);

  // Precompute direct period metrics ONCE per account in subtree
  const metricsMap = new Map<string, AccountPeriodMetrics>();
  for (const id of subtreeIdsInScope) {
    const acc = scopedAccountMap.get(id);
    if (!acc) continue;
    const accTxs = index.transactionsByAccount.get(id) || [];
    metricsMap.set(id, computeAccountPeriodMetrics(acc, accTxs, scope.fromDate, scope.toDate));
  }

  // Determine relevance across descendant subtrees (keep node iff itself OR any descendant passes isReportRelevantAccount)
  const relevantBranchIdSet = new Set<string>();
  let excludedDormantCount = 0;
  const allDescendantIds = index.getDescendantIds(rootAccount.id);

  for (const descId of allDescendantIds) {
    const subIds = index.getSubtreeIds(descId);
    const hasRelevant = subIds.some((id) => {
      const m = metricsMap.get(id);
      return m ? isReportRelevantAccount(m) : false;
    });
    if (hasRelevant) {
      relevantBranchIdSet.add(descId);
    } else {
      excludedDormantCount++;
    }
  }

  // Traverse descendants in DFS hierarchical order starting under rootAccount at relative level 1
  const branchRows: ParentAccountPeriodRow[] = [];
  const visited = new Set<string>([rootAccount.id]);

  const walkBranches = (parentId: string, level: number) => {
    const children = index.getDirectChildren(parentId);
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);

      if (relevantBranchIdSet.has(child.id)) {
        const direct = metricsMap.get(child.id)!;
        const subDescendants = index
          .getDescendantIds(child.id)
          .filter((id) => relevantBranchIdSet.has(id));
        const hasSubBranches = subDescendants.length > 0;
        const { balanceType, balanceTypeLabel } = classifyParentReportBalance(
          direct.closingBalanceMinor,
          direct.periodTransactionCount
        );
        const parentAcc = child.parentId ? fullAccountMap.get(child.parentId) : undefined;

        branchRows.push({
          id: child.id,
          account: child,
          rowKind: 'branch',
          displayName: child.name,
          accountTypeLabel: hasSubBranches ? 'فرعي رئيسي' : 'فرعي',
          categoryName: categoryMap.get(child.categoryId) || 'غير مصنف',
          level,
          parentName: parentAcc ? parentAcc.name : null,
          hierarchicalPath: formatAccountPath(child.id, fullAccountMap) || child.name,
          openingAtPeriodMinor: direct.openingAtPeriodMinor,
          owedByMinor: direct.directOwedByMinor,
          owedToMinor: direct.directOwedToMinor,
          netMovementMinor: direct.directNetMovementMinor,
          closingBalanceMinor: direct.closingBalanceMinor,
          periodTransactionCount: direct.periodTransactionCount,
          balanceType,
          balanceTypeLabel,
          hasSubBranches,
          descendantCount: subDescendants.length,
        });
      }

      walkBranches(child.id, level + 1);
    }
  };

  walkBranches(rootAccount.id, 1);

  const directRootMetrics = metricsMap.get(rootAccount.id)!;
  const hasDirectRootActivity = isReportRelevantAccount(directRootMetrics);
  const rootCatName = categoryMap.get(rootAccount.categoryId) || 'غير مصنف';
  const rootPath = formatAccountPath(rootAccount.id, fullAccountMap) || rootAccount.name;

  let directRootRow: ParentAccountPeriodRow | null = null;
  if (hasDirectRootActivity) {
    const directBalCls = classifyParentReportBalance(
      directRootMetrics.closingBalanceMinor,
      directRootMetrics.periodTransactionCount
    );
    directRootRow = {
      id: `${rootAccount.id}__direct`,
      account: rootAccount,
      rowKind: 'direct_root',
      displayName: `مباشر على الحساب الرئيسي — ${rootAccount.name}`,
      accountTypeLabel: 'مباشر على الرئيسي',
      categoryName: rootCatName,
      level: 1,
      parentName: rootAccount.name,
      hierarchicalPath: `${rootPath} (مباشر)`,
      openingAtPeriodMinor: directRootMetrics.openingAtPeriodMinor,
      owedByMinor: directRootMetrics.directOwedByMinor,
      owedToMinor: directRootMetrics.directOwedToMinor,
      netMovementMinor: directRootMetrics.directNetMovementMinor,
      closingBalanceMinor: directRootMetrics.closingBalanceMinor,
      periodTransactionCount: directRootMetrics.periodTransactionCount,
      balanceType: directBalCls.balanceType,
      balanceTypeLabel: directBalCls.balanceTypeLabel,
      hasSubBranches: false,
      descendantCount: 0,
    };
  }

  const detailRows: ParentAccountPeriodRow[] = directRootRow
    ? [directRootRow, ...branchRows]
    : [...branchRows];

  // Consolidated Totals = directRootMetrics + every relevant descendant direct metrics ONCE (NO Double Counting)
  let totalOpening = directRootMetrics.openingAtPeriodMinor;
  let totalOwedBy = directRootMetrics.directOwedByMinor;
  let totalOwedTo = directRootMetrics.directOwedToMinor;
  let totalTxCount = directRootMetrics.periodTransactionCount;

  for (const b of branchRows) {
    totalOpening += b.openingAtPeriodMinor;
    totalOwedBy += b.owedByMinor;
    totalOwedTo += b.owedToMinor;
    totalTxCount += b.periodTransactionCount;
  }

  const totalNetMovement = totalOwedBy - totalOwedTo;
  const totalClosing = totalOpening + totalNetMovement;
  const summaryCls = classifyParentReportBalance(totalClosing, totalTxCount);
  const relevantDirectChildrenCount = index
    .getDirectChildren(rootAccount.id)
    .filter((c) => relevantBranchIdSet.has(c.id)).length;

  const summary: ParentAccountPeriodSummary = {
    openingAtPeriodMinor: totalOpening,
    owedByMinor: totalOwedBy,
    owedToMinor: totalOwedTo,
    netMovementMinor: totalNetMovement,
    closingBalanceMinor: totalClosing,
    periodTransactionCount: totalTxCount,
    balanceType: summaryCls.balanceType,
    balanceTypeLabel: summaryCls.balanceTypeLabel,
    directChildrenCount: relevantDirectChildrenCount,
    activeBranchesCount: branchRows.length,
    totalDescendantsInScopeCount: allDescendantIds.length,
    hasDirectRootActivity,
  };

  const summaryRow: ParentAccountPeriodRow = {
    id: rootAccount.id,
    account: rootAccount,
    rowKind: 'consolidated_summary',
    displayName: rootAccount.name,
    accountTypeLabel: 'رئيسي مجمع',
    categoryName: rootCatName,
    level: 0,
    parentName: rootAccount.parentId ? fullAccountMap.get(rootAccount.parentId)?.name || null : null,
    hierarchicalPath: rootPath,
    openingAtPeriodMinor: totalOpening,
    owedByMinor: totalOwedBy,
    owedToMinor: totalOwedTo,
    netMovementMinor: totalNetMovement,
    closingBalanceMinor: totalClosing,
    periodTransactionCount: totalTxCount,
    balanceType: summaryCls.balanceType,
    balanceTypeLabel: summaryCls.balanceTypeLabel,
    hasSubBranches: branchRows.length > 0,
    descendantCount: branchRows.length,
  };

  // Movements across the selected root + its relevant scoped branches
  const activeSubtreeIds = new Set<string>([rootAccount.id, ...relevantBranchIdSet]);
  const periodTxs = transactions
    .filter((t) => {
      if (!activeSubtreeIds.has(t.accountId)) return false;
      if (scope.fromDate && t.date < scope.fromDate) return false;
      if (scope.toDate && t.date > scope.toDate) return false;
      return true;
    })
    .sort(compareTransactions);

  let cumulativeRunningMinor = totalOpening;
  const movements: ReportPeriodMovementRow[] = periodTxs.map((t) => {
    const signedAmountMinor = getSignedTransactionMinor(t.entryType, t.amountMinor);
    cumulativeRunningMinor += signedAmountMinor;
    const acc = fullAccountMap.get(t.accountId);
    const hierarchicalPath = formatAccountPath(t.accountId, fullAccountMap) || acc?.name || 'حساب غير معروف';
    return {
      transaction: t,
      accountName: acc?.name || 'حساب غير معروف',
      hierarchicalPath,
      signedAmountMinor,
      cumulativeRunningMinor,
    };
  });

  const allRows: ParentAccountPeriodRow[] =
    mode === 'summary' ? [summaryRow] : [summaryRow, ...detailRows];

  return {
    rootAccount,
    appliedScope: scope,
    mode,
    summary,
    directRootMetrics,
    summaryRow,
    directRootRow,
    branchRows,
    detailRows,
    allRows,
    movements,
    excludedDormantCount,
  };
}


