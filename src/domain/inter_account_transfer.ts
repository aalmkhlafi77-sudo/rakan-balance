/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Inter-Account Transfer Pure Domain Engine (N1)
 * Follows Document v2 & Milestone N1 Specifications:
 * - Transfers debt from a source account to a destination account.
 * - Source balance must be positive (owed by account) and >= transfer amount.
 * - Invariant: Sum of system balances and net position remains unchanged (delta = 0).
 * - Generates an atomic pair of entries:
 *   * Source: owedToAccount (-amountMinor) reduces its debt.
 *   * Destination: owedByAccount (+amountMinor) increases its debt.
 * - Deep validation of transfer pairs for backup integrity and data consistency.
 */

import {
  AccountModel,
  InterAccountTransferInput,
  TransactionModel,
} from './types.ts';
import { calculateAccountBalance } from './balance_calculator.ts';
import { MAX_SAFE_MINOR_AMOUNT } from './money.ts';

/**
 * Builds the atomic pair of transaction records for an inter-account transfer.
 */
export function buildTransferEntries(
  input: InterAccountTransferInput,
  existingTransferId?: string,
  nowIso: string = new Date().toISOString()
): {
  transferId: string;
  sourceEntry: TransactionModel;
  destinationEntry: TransactionModel;
} {
  const transferId =
    existingTransferId ||
    `trf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const sourceEntryId = `tx_src_${transferId}_${Math.random().toString(36).substring(2, 5)}`;
  const destEntryId = `tx_dst_${transferId}_${Math.random().toString(36).substring(2, 5)}`;

  // Source Entry: reduces source account debt (owedToAccount = -amountMinor)
  const sourceEntry: TransactionModel = {
    id: sourceEntryId,
    accountId: input.sourceAccountId,
    entryType: 'owedToAccount',
    amountMinor: input.amountMinor,
    date: input.date,
    description: input.description.trim(),
    notes: input.notes?.trim() || undefined,
    attachmentIds: [],
    isDemo: Boolean(input.isDemo),
    transferId,
    transferRole: 'source',
    counterpartyAccountId: input.destinationAccountId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Destination Entry: increases destination account debt (owedByAccount = +amountMinor)
  const destinationEntry: TransactionModel = {
    id: destEntryId,
    accountId: input.destinationAccountId,
    entryType: 'owedByAccount',
    amountMinor: input.amountMinor,
    date: input.date,
    description: input.description.trim(),
    notes: input.notes?.trim() || undefined,
    attachmentIds: [],
    isDemo: Boolean(input.isDemo),
    transferId,
    transferRole: 'destination',
    counterpartyAccountId: input.sourceAccountId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { transferId, sourceEntry, destinationEntry };
}

/**
 * Strictly validates an inter-account transfer input against domain rules.
 */
export function validateInterAccountTransfer(
  input: InterAccountTransferInput,
  accounts: AccountModel[],
  currentTransactions: TransactionModel[],
  editingTransferId?: string
): { isValid: boolean; error?: string } {
  // 1. Source and Destination must not be identical
  if (!input.sourceAccountId || !input.destinationAccountId) {
    return { isValid: false, error: 'يجب تحديد الحساب المحول منه والحساب المحول إليه.' };
  }

  if (input.sourceAccountId === input.destinationAccountId) {
    return {
      isValid: false,
      error: 'لا يمكن إجراء حركة بينية للحساب نفسه؛ يجب اختيار حسابين مختلفين.',
    };
  }

  // 2. Both accounts must exist
  const sourceAccount = accounts.find((a) => a.id === input.sourceAccountId);
  const destAccount = accounts.find((a) => a.id === input.destinationAccountId);

  if (!sourceAccount) {
    return { isValid: false, error: 'الحساب المحول منه غير موجود بالنظام.' };
  }

  if (!destAccount) {
    return { isValid: false, error: 'الحساب المحول إليه غير موجود بالنظام.' };
  }

  // 3. Both accounts must be active
  if (sourceAccount.status !== 'active') {
    return { isValid: false, error: `الحساب المحول منه "${sourceAccount.name}" غير نشط (مؤرشف).` };
  }

  if (destAccount.status !== 'active') {
    return { isValid: false, error: `الحساب المحول إليه "${destAccount.name}" غير نشط (مؤرشف).` };
  }

  // 4. Both accounts must belong to the same workspace scope (real or demo)
  if (Boolean(sourceAccount.isDemo) !== Boolean(destAccount.isDemo)) {
    return { isValid: false, error: 'لا يمكن إجراء حركة بينية بين حساب تجريبي وحساب حقيقي.' };
  }

  // 5. Amount validation: safe positive integer in Halalas
  if (
    typeof input.amountMinor !== 'number' ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  ) {
    return {
      isValid: false,
      error: 'مبلغ الحركة البينية يجب أن يكون عدداً صحيحاً موجباً وآمناً بالهللات (> 0).',
    };
  }

  if (input.amountMinor > MAX_SAFE_MINOR_AMOUNT) {
    return {
      isValid: false,
      error: 'مبلغ الحركة البينية يتجاوز الحد الأقصى المسموح به للنظام المالي.',
    };
  }

  // 6. Date validation: YYYY-MM-DD
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { isValid: false, error: 'تاريخ الحركة البينية غير صالح (التنسيق المطلوب: YYYY-MM-DD).' };
  }

  // 7. Description validation
  if (!input.description || !input.description.trim()) {
    return { isValid: false, error: 'بيان الحركة البينية إلزامي ولا يمكن تركه فارغاً.' };
  }

  // 8. Balance check: Source account must have sufficient positive balance
  // Calculate source balance from current transactions
  let relevantTransactions = currentTransactions;
  let availableBalanceMinor: number;

  if (editingTransferId) {
    // When editing, exclude the old transfer's entries so the source account gets its previous balance back
    relevantTransactions = currentTransactions.filter((t) => t.transferId !== editingTransferId);
    availableBalanceMinor = calculateAccountBalance(sourceAccount, relevantTransactions);
  } else {
    availableBalanceMinor = calculateAccountBalance(sourceAccount, currentTransactions);
  }

  if (availableBalanceMinor <= 0) {
    return {
      isValid: false,
      error: `لا يمكن نقل مديونية من الحساب "${sourceAccount.name}" لأن رصيده الحالي ليس مديونية مستحقة لك (رصيده المتاح: ${(availableBalanceMinor / 100).toFixed(2)} ر.س).`,
    };
  }

  if (input.amountMinor > availableBalanceMinor) {
    return {
      isValid: false,
      error: `مبلغ النقل (${(input.amountMinor / 100).toFixed(2)} ر.س) يتجاوز الرصيد المستحق على الحساب المحول منه (${(availableBalanceMinor / 100).toFixed(2)} ر.س).`,
    };
  }

  return { isValid: true };
}

/**
 * Validates integrity of all transfer pairs in a transaction list (for backup verification and audits).
 * Ensures:
 * - Every transferId has exactly 2 transactions.
 * - One is 'source' (owedToAccount) and one is 'destination' (owedByAccount).
 * - Matching amountMinor and date.
 * - Reciprocal counterparties and distinct accounts.
 * - Backwards compatible: transactions without transferId are valid regular transactions.
 */
export function validateTransferPairs(
  transactions: TransactionModel[]
): { isValid: boolean; error?: string } {
  const transferGroups = new Map<string, TransactionModel[]>();

  for (const tx of transactions) {
    // Structural integrity: transferId and transferRole must be coherent
    if (tx.transferId || tx.transferRole || tx.counterpartyAccountId) {
      if (!tx.transferId || typeof tx.transferId !== 'string') {
        return {
          isValid: false,
          error: `حركة مالية (${tx.id}) تحتوي على دور بيني دون وجود معرف حركة بينية (transferId) صالح.`,
        };
      }
      if (tx.transferRole !== 'source' && tx.transferRole !== 'destination') {
        return {
          isValid: false,
          error: `الحركة البينية (${tx.id}) تحتوي على دور غير صالح (${tx.transferRole}).`,
        };
      }
      if (!tx.counterpartyAccountId || typeof tx.counterpartyAccountId !== 'string') {
        return {
          isValid: false,
          error: `الحركة البينية (${tx.id}) تفتقر إلى معرف الحساب المقابل (counterpartyAccountId).`,
        };
      }

      const group = transferGroups.get(tx.transferId) || [];
      group.push(tx);
      transferGroups.set(tx.transferId, group);
    }
  }

  for (const [transferId, group] of transferGroups.entries()) {
    if (group.length !== 2) {
      return {
        isValid: false,
        error: `الحركة البينية (${transferId}) تالفة أو غير مكتملة: تحتوي على ${group.length} طرف بدلاً من طرفين متناظرين (source و destination).`,
      };
    }

    const source = group.find((t) => t.transferRole === 'source');
    const destination = group.find((t) => t.transferRole === 'destination');

    if (!source || !destination) {
      return {
        isValid: false,
        error: `الحركة البينية (${transferId}) تفتقر إلى أحد الطرفين (المصدر أو المستقر).`,
      };
    }

    // Source must be owedToAccount (-amountMinor) and destination must be owedByAccount (+amountMinor)
    if (source.entryType !== 'owedToAccount') {
      return {
        isValid: false,
        error: `نوع قيد طرف المصدر في الحركة البينية (${transferId}) يجب أن يكون "owedToAccount" (له / خفض مديونية).`,
      };
    }

    if (destination.entryType !== 'owedByAccount') {
      return {
        isValid: false,
        error: `نوع قيد طرف المستقر في الحركة البينية (${transferId}) يجب أن يكون "owedByAccount" (عليه / إضافة مديونية).`,
      };
    }

    // Amounts must match exactly
    if (source.amountMinor !== destination.amountMinor) {
      return {
        isValid: false,
        error: `عدم تطابق المبالغ بين طرفي الحركة البينية (${transferId}): المصدر (${source.amountMinor}) مقابل المستقر (${destination.amountMinor}).`,
      };
    }

    // Dates must match
    if (source.date !== destination.date) {
      return {
        isValid: false,
        error: `عدم تطابق تاريخ طرفي الحركة البينية (${transferId}): ${source.date} مقابل ${destination.date}.`,
      };
    }

    // Accounts must be distinct
    if (source.accountId === destination.accountId) {
      return {
        isValid: false,
        error: `طرفا الحركة البينية (${transferId}) يشيران إلى نفس الحساب (${source.accountId}).`,
      };
    }

    // Reciprocal counterparties
    if (source.counterpartyAccountId !== destination.accountId) {
      return {
        isValid: false,
        error: `الحساب المقابل لطرف المصدر (${source.counterpartyAccountId}) لا يطابق حساب المستقر (${destination.accountId}) في الحركة (${transferId}).`,
      };
    }

    if (destination.counterpartyAccountId !== source.accountId) {
      return {
        isValid: false,
        error: `الحساب المقابل لطرف المستقر (${destination.counterpartyAccountId}) لا يطابق حساب المصدر (${source.accountId}) في الحركة (${transferId}).`,
      };
    }
  }

  return { isValid: true };
}
