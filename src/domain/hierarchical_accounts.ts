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
import { calculateHistoricalBalanceAt, ReportFilterOptions } from './financial_reports.ts';

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
  openingBalanceMinor: number;
  periodOwedByMinor: number;
  periodOwedToMinor: number;
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
  descendantIds: string[];
  descendantCount: number;
  subtreeAccountIds: string[];
  openingConsolidatedBalanceMinor: number;
  closingConsolidatedBalanceMinor: number;
  totalOwedByMinor: number;
  totalOwedToMinor: number;
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
  directChildrenCount: number;
  descendantCount: number;
  directOpeningMinor: number;
  directOwedByMinor: number;
  directOwedToMinor: number;
  directNetMovementMinor: number;
  directBalanceMinor: number;
  consolidatedChildrenOnlyMinor: number;
  consolidatedBalanceMinor: number;
  directBalanceType: 'receivable' | 'payable' | 'balanced';
  consolidatedBalanceType: 'receivable' | 'payable' | 'balanced';
}

export interface HierarchicalAccountsReport {
  rows: HierarchicalAccountsReportRow[];
  totalDirectReceivableMinor: number; // Direct only — NO double counting
  totalDirectPayableMinor: number; // Direct only — NO double counting
  netDirectBalanceMinor: number; // Direct only — NO double counting
  rootAccountsCount: number;
  branchAccountsCount: number;
  parentAccountsCount: number;
  totalAccountsCount: number;
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
 * Calculates Consolidated Balance for an account (direct balance + direct balances of ALL descendants).
 * Strictly a read-only Calculated View.
 */
export function calculateConsolidatedBalance(
  accountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  index?: HierarchyIndex
): number {
  if (index && !index.toDate) {
    return index.getConsolidatedBalance(accountId);
  }
  const accountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  if (!accountMap.has(accountId)) return 0;

  const subtreeIds = getSubtreeAccountIds(accountId, accounts);
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
 * Excludes any transaction with date > toDate across both parent and all descendants.
 */
export function calculateHistoricalConsolidatedBalance(
  accountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  toDate?: string,
  index?: HierarchyIndex
): number {
  if (index && index.toDate === toDate) {
    return index.getConsolidatedBalance(accountId);
  }
  const accountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  if (!accountMap.has(accountId)) return 0;

  const subtreeIds = getSubtreeAccountIds(accountId, accounts);
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
 * Calculates Consolidated Account Statement for a root/parent account across its entire subtree.
 * - Opening consolidated balance = Σ openingBalanceMinor(subtree) + Σ signedTx(subtree, date < fromDate)
 * - Period rows = all transactions of subtree within [fromDate, toDate] sorted stably
 * - Sequential running consolidated balance
 */
export function calculateConsolidatedStatement(
  rootAccountId: string,
  accounts: AccountModel[],
  transactions: TransactionModel[],
  fromDate?: string,
  toDate?: string
): ConsolidatedStatementResult {
  const index = createHierarchyIndex(accounts, transactions, toDate);
  const rootAccount = index.accountMap.get(rootAccountId);

  if (!rootAccount) {
    throw new Error(`الحساب غير موجود: ${rootAccountId}`);
  }

  const descendantIds = index.getDescendantIds(rootAccountId);
  const subtreeAccountIds = [rootAccountId, ...descendantIds];
  const subtreeSet = new Set<string>(subtreeAccountIds);

  // Opening balance at fromDate across the entire subtree
  let openingConsolidatedBalanceMinor = 0;
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
      openingConsolidatedBalanceMinor += getSignedTransactionMinor(t.entryType, t.amountMinor);
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
    return {
      account: node.account,
      level: index.getDepth(node.account.id),
      parentName: parentAcc ? parentAcc.name : null,
      hierarchicalPath: index.getFormattedPath(node.account.id),
      openingBalanceMinor: node.account.openingBalanceMinor,
      periodOwedByMinor: periodOwedByByAccount.get(node.account.id) || 0,
      periodOwedToMinor: periodOwedToByAccount.get(node.account.id) || 0,
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
    descendantIds,
    descendantCount: descendantIds.length,
    subtreeAccountIds,
    openingConsolidatedBalanceMinor,
    closingConsolidatedBalanceMinor: runningBalance,
    totalOwedByMinor,
    totalOwedToMinor,
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
 * Generates Hierarchical Accounts Report (الحسابات الرئيسية والفروع).
 * Computes consolidated balances across the full account tree up to options.toDate,
 * while computing grand totals strictly from direct balances of filtered rows (zero double counting).
 */
export function generateHierarchicalAccountsReport(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  categories: CategoryModel[],
  options: ReportFilterOptions = {}
): HierarchicalAccountsReport {
  const categoryMap = new Map<string, string>(categories.map((c) => [c.id, c.name]));
  const index = createHierarchyIndex(accounts, transactions, options.toDate);
  const treeNodes = flattenAccountsInTreeOrder(accounts);

  // Filter nodes according to report filter options while preserving tree order & full consolidated calculations
  const searchLower = options.searchQuery ? options.searchQuery.trim().toLowerCase() : '';
  const filteredNodes = treeNodes.filter(({ account }) => {
    if (options.status && options.status !== 'all' && account.status !== options.status) {
      return false;
    }
    if (options.categoryId && options.categoryId !== 'all' && account.categoryId !== options.categoryId) {
      return false;
    }
    if (searchLower) {
      const nameMatch = account.name.toLowerCase().includes(searchLower);
      const phoneMatch = Boolean(account.phone && account.phone.toLowerCase().includes(searchLower));
      if (!nameMatch && !phoneMatch) return false;
    }
    return true;
  });

  let totalDirectReceivableMinor = 0;
  let totalDirectPayableMinor = 0;
  let rootAccountsCount = 0;
  let branchAccountsCount = 0;
  let parentAccountsCount = 0;

  const rows: HierarchicalAccountsReportRow[] = filteredNodes.map((node) => {
    const acc = node.account;
    const accTxs = index.transactionsByAccount.get(acc.id) || [];

    let directOwedByMinor = 0;
    let directOwedToMinor = 0;
    for (const t of accTxs) {
      if (options.fromDate && t.date < options.fromDate) continue;
      if (options.toDate && t.date > options.toDate) continue;
      if (t.entryType === 'owedByAccount') {
        directOwedByMinor += t.amountMinor;
      } else {
        directOwedToMinor += t.amountMinor;
      }
    }

    const directBalanceMinor = index.getDirectBalance(acc.id);
    const consolidatedBalanceMinor = index.getConsolidatedBalance(acc.id);
    const directChildrenCount = index.getDirectChildren(acc.id).length;
    const descendantCount = index.getDescendantIds(acc.id).length;
    const isParent = descendantCount > 0;

    if (directBalanceMinor > 0) {
      totalDirectReceivableMinor += directBalanceMinor;
    } else if (directBalanceMinor < 0) {
      totalDirectPayableMinor += Math.abs(directBalanceMinor);
    }

    if (!acc.parentId) {
      rootAccountsCount++;
    } else {
      branchAccountsCount++;
    }
    if (isParent) {
      parentAccountsCount++;
    }

    const parentAccount = acc.parentId ? index.accountMap.get(acc.parentId) : undefined;

    return {
      account: acc,
      categoryName: categoryMap.get(acc.categoryId) || 'غير مصنف',
      parentName: parentAccount ? parentAccount.name : null,
      level: node.level,
      hierarchicalPath: node.hierarchicalPath,
      isParent,
      directChildrenCount,
      descendantCount,
      directOpeningMinor: acc.openingBalanceMinor,
      directOwedByMinor,
      directOwedToMinor,
      directNetMovementMinor: directOwedByMinor - directOwedToMinor,
      directBalanceMinor,
      consolidatedChildrenOnlyMinor: consolidatedBalanceMinor - directBalanceMinor,
      consolidatedBalanceMinor,
      directBalanceType: classifyBalanceType(directBalanceMinor),
      consolidatedBalanceType: classifyBalanceType(consolidatedBalanceMinor),
    };
  });

  return {
    rows,
    totalDirectReceivableMinor,
    totalDirectPayableMinor,
    netDirectBalanceMinor: totalDirectReceivableMinor - totalDirectPayableMinor,
    rootAccountsCount,
    branchAccountsCount,
    parentAccountsCount,
    totalAccountsCount: rows.length,
  };
}
