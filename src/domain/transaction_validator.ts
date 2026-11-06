/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Centralized Transaction Validator
 * Follows Document v2 & Final N0 Validation:
 * - Guarantees amountMinor is a safe positive integer in Halalas (> 0)
 * - Restricts amount to MAX_SAFE_MINOR_AMOUNT
 * - Strictly verifies target account exists and is ACTIVE (not archived)
 * - Verifies valid ISO date and non-empty description
 */

import { AccountModel, EntryType } from './types.ts';
import { MAX_SAFE_MINOR_AMOUNT } from './money.ts';

export interface ValidatedTransactionParams {
  accountId: string;
  entryType: EntryType;
  amountMinor: number;
  date: string;
  description: string;
}

export interface TransactionValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Centrally validates all new and edited transaction payloads.
 * Throws or returns validation result.
 */
export function validateTransactionInput(
  params: ValidatedTransactionParams,
  availableAccounts: AccountModel[]
): TransactionValidationResult {
  // 1. Amount validations
  if (typeof params.amountMinor !== 'number' || !Number.isSafeInteger(params.amountMinor)) {
    return {
      isValid: false,
      error: 'مبلغ الحركة يجب أن يكون عدداً صحيحاً بالهللات (Safe Integer).',
    };
  }

  if (params.amountMinor <= 0) {
    return {
      isValid: false,
      error: 'يجب أن يكون مبلغ الحركة أكبر من صفر قطوعاً (قيمة موجبة بالهللات).',
    };
  }

  if (params.amountMinor > MAX_SAFE_MINOR_AMOUNT) {
    return {
      isValid: false,
      error: `مبلغ الحركة يتجاوز الحد الأقصى الآمن المسموح به (${MAX_SAFE_MINOR_AMOUNT / 100} ر.س).`,
    };
  }

  // 2. Account existence & active status validation
  if (!params.accountId || typeof params.accountId !== 'string') {
    return {
      isValid: false,
      error: 'معرف الحساب مفقود أو غير صالح.',
    };
  }

  const targetAccount = availableAccounts.find((a) => a.id === params.accountId);
  if (!targetAccount) {
    return {
      isValid: false,
      error: 'الحساب المحدد للحركة غير موجود في مساحة العمل الحالية.',
    };
  }

  if (targetAccount.status === 'archived') {
    return {
      isValid: false,
      error: `لا يمكن تسجيل أو تعديل حركات مالية على الحساب المؤرشف "${targetAccount.name}". يرجى إلغاء أرشفة الحساب أولاً.`,
    };
  }

  // 3. EntryType validation
  if (params.entryType !== 'owedByAccount' && params.entryType !== 'owedToAccount') {
    return {
      isValid: false,
      error: 'نوع القيد المالي غير صالح (يجب أن يكون "عليه/لك" أو "له/عليك").',
    };
  }

  // 4. Date validation
  if (!params.date || !/^\d{4}-\d{2}-\d{2}$/.test(params.date) || Number.isNaN(Date.parse(params.date))) {
    return {
      isValid: false,
      error: 'تاريخ الحركة غير صالح (يجب أن يكون بتنسيق YYYY-MM-DD سليم).',
    };
  }

  // 5. Description validation
  if (!params.description || typeof params.description !== 'string' || !params.description.trim()) {
    return {
      isValid: false,
      error: 'بيان/وصف الحركة مطلوب ولا يمكن تركه فارغاً.',
    };
  }

  return { isValid: true };
}
