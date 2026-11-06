/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Pure Domain Balance Engine
 * Follows Document v2 Sections 3, 4, 16:
 * - owedByAccount = +amountMinor (عليه)
 * - owedToAccount = -amountMinor (له)
 * - B(account) = openingBalanceMinor + Σ signedTransactionsMinor
 * - totalReceivable = Σ max(B, 0)
 * - totalPayable = Σ max(-B, 0)
 * - net = totalReceivable - totalPayable
 * - openingAt(fromDate) = openingBalanceMinor + Σ movements with date < fromDate
 * - closingAt(toDate) = openingAt + Σ movements within selected range
 * - Stable sorting: date ASC, createdAt ASC, id ASC
 * - Sub-accounts: Direct balance only; no duplicate counting in grand totals
 * - Tree cycle prevention: An account cannot be parent of itself or its descendants
 */

import { AccountModel, EntryType, StatementRow, TransactionModel } from './types.ts';

/**
 * Returns signed minor amount for a transaction based on entryType:
 * owedByAccount -> +amountMinor (عليه)
 * owedToAccount -> -amountMinor (له)
 */
export function getSignedTransactionMinor(entryType: EntryType, amountMinor: number): number {
  const absAmount = Math.abs(amountMinor);
  return entryType === 'owedByAccount' ? absAmount : -absAmount;
}

/**
 * Calculates current net balance for a single account:
 * B = openingBalanceMinor + Σ signedTransactions
 */
export function calculateAccountBalance(
  account: AccountModel,
  transactions: TransactionModel[]
): number {
  const accountTransactions = transactions.filter((t) => t.accountId === account.id);
  
  const movementsTotal = accountTransactions.reduce((acc, t) => {
    return acc + getSignedTransactionMinor(t.entryType, t.amountMinor);
  }, 0);

  return account.openingBalanceMinor + movementsTotal;
}

/**
 * Stable sorting comparator for transactions:
 * 1. Date ASC (YYYY-MM-DD)
 * 2. CreatedAt ASC (ISO 8601)
 * 3. ID ASC (lexicographical)
 */
export function compareTransactions(a: TransactionModel, b: TransactionModel): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }
  return a.id.localeCompare(b.id);
}

/**
 * Calculates statement for an account over a specific date range:
 * - openingAt(fromDate) = openingBalance + Σ (movements with date < fromDate)
 * - sequential rows with running balance
 * - closingAt(toDate) = openingAt + Σ (movements in range)
 */
export function calculateAccountStatement(
  account: AccountModel,
  allTransactions: TransactionModel[],
  fromDate?: string,
  toDate?: string
): {
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  totalOwedByMinor: number; // إجمالي عليه خلال الفترة
  totalOwedToMinor: number; // إجمالي له خلال الفترة
  rows: StatementRow[];
} {
  // Get all transactions for this account sorted stably
  const accountTransactions = allTransactions
    .filter((t) => t.accountId === account.id)
    .sort(compareTransactions);

  // Split transactions: before fromDate vs within [fromDate, toDate]
  let openingBalanceMinor = account.openingBalanceMinor;
  const filteredTransactions: TransactionModel[] = [];

  for (const t of accountTransactions) {
    if (fromDate && t.date < fromDate) {
      openingBalanceMinor += getSignedTransactionMinor(t.entryType, t.amountMinor);
    } else if (toDate && t.date > toDate) {
      // After period end, skip
      continue;
    } else {
      // In range
      filteredTransactions.push(t);
    }
  }

  // Calculate sequential running balance
  let runningBalance = openingBalanceMinor;
  let totalOwedByMinor = 0;
  let totalOwedToMinor = 0;

  const rows: StatementRow[] = filteredTransactions.map((t) => {
    const signedDelta = getSignedTransactionMinor(t.entryType, t.amountMinor);
    if (t.entryType === 'owedByAccount') {
      totalOwedByMinor += t.amountMinor;
    } else {
      totalOwedToMinor += t.amountMinor;
    }
    runningBalance += signedDelta;
    return {
      transaction: t,
      signedAmountMinor: signedDelta,
      runningBalanceMinor: runningBalance,
    };
  });

  return {
    openingBalanceMinor,
    closingBalanceMinor: runningBalance,
    totalOwedByMinor,
    totalOwedToMinor,
    rows,
  };
}

/**
 * Calculates grand totals across active accounts for the dashboard:
 * - totalReceivable = Σ max(B, 0) (إجمالي لك)
 * - totalPayable = Σ max(-B, 0) (إجمالي عليك)
 * - net = totalReceivable - totalPayable (صافي المركز المالي)
 * 
 * Sub-accounts are separate entities; each contributes its own direct balance.
 * Parent balances do NOT double-count children.
 */
export function calculateDashboardSummary(
  accounts: AccountModel[],
  transactions: TransactionModel[],
  includeArchived: boolean = false
): {
  totalReceivableMinor: number; // لك
  totalPayableMinor: number;    // عليك
  netBalanceMinor: number;      // الصافي
  activeAccountsCount: number;
  archivedAccountsCount: number;
  totalTransactionsCount: number;
  accountBalances: Map<string, number>;
} {
  const accountBalances = new Map<string, number>();
  let totalReceivableMinor = 0;
  let totalPayableMinor = 0;
  let activeAccountsCount = 0;
  let archivedAccountsCount = 0;

  for (const account of accounts) {
    const balance = calculateAccountBalance(account, transactions);
    accountBalances.set(account.id, balance);

    if (account.status === 'active') {
      activeAccountsCount++;
      if (balance > 0) {
        totalReceivableMinor += balance;
      } else if (balance < 0) {
        totalPayableMinor += Math.abs(balance);
      }
    } else {
      archivedAccountsCount++;
      if (includeArchived) {
        if (balance > 0) {
          totalReceivableMinor += balance;
        } else if (balance < 0) {
          totalPayableMinor += Math.abs(balance);
        }
      }
    }
  }

  const netBalanceMinor = totalReceivableMinor - totalPayableMinor;

  return {
    totalReceivableMinor,
    totalPayableMinor,
    netBalanceMinor,
    activeAccountsCount,
    archivedAccountsCount,
    totalTransactionsCount: transactions.length,
    accountBalances,
  };
}

/**
 * Tree Cycle Prevention (Document v2 Section 5.1 & 8):
 * Verifies that setting candidateParentId as parent of accountId does not create a circular dependency.
 * Returns true if a cycle WOULD be created (i.e. invalid), false if safe.
 */
export function checkTreeCycle(
  accounts: AccountModel[],
  accountId: string,
  candidateParentId: string | null
): boolean {
  if (!candidateParentId) return false;
  if (accountId === candidateParentId) return true;

  const accountMap = new Map<string, AccountModel>(accounts.map((a) => [a.id, a]));
  let currentId: string | null = candidateParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === accountId) {
      return true; // Cycle detected: candidateParent is a descendant of account
    }
    if (visited.has(currentId)) {
      return true; // Existing cycle in tree
    }
    visited.add(currentId);
    const parentAccount = accountMap.get(currentId);
    currentId = parentAccount ? parentAccount.parentId : null;
  }

  return false;
}
