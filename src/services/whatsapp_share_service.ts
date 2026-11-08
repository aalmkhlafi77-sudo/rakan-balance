/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — WhatsApp & Statement Sharing Service
 * Sanitizes international phone numbers, formats transaction & statement summaries,
 * integrates Web Contact Picker API & Web Share API with 100% offline fallbacks.
 */

import type { TransactionModel, AccountModel } from '../domain/types.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';

export interface PhoneValidationResult {
  isValid: boolean;
  cleanPhone: string;
  rawPhone: string;
  error?: string;
}

/**
 * Sanitizes and validates international phone numbers (digits only, 8-15 digits)
 * Removes leading +, spaces, dashes, brackets, and leading 00.
 */
export function sanitizePhoneNumber(phoneStr?: string | null): PhoneValidationResult {
  const rawPhone = phoneStr ? phoneStr.trim() : '';
  if (!rawPhone) {
    return { isValid: false, cleanPhone: '', rawPhone, error: 'رقم الهاتف غير مدخل.' };
  }

  // Remove leading +, spaces, dashes, brackets
  let digits = rawPhone.replace(/[^\d]/g, '');

  // Strip leading international 00
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // E.164 international numbers cannot start with 0. Local numbers require an
  // explicit country code; never silently assume the user's country.
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return {
      isValid: false,
      cleanPhone: digits,
      rawPhone,
      error: 'رقم الهاتف غير صالح للدولية. يرجى التأكد من إدخال رمز الدولة (مثال: 966501234567).',
    };
  }

  return {
    isValid: true,
    cleanPhone: digits,
    rawPhone,
  };
}

/**
 * Checks whether the Web Contact Picker API is supported by the current browser
 */
export function isContactPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as any).contacts;
}

/**
 * Triggers native Web Contact Picker to select a phone number (upon explicit user click)
 */
export async function pickContactPhone(): Promise<PhoneValidationResult> {
  if (!isContactPickerSupported()) {
    return {
      isValid: false,
      cleanPhone: '',
      rawPhone: '',
      error: 'ميزة اختيار جهات الاتصال غير مدعومة في هذا المتصفح.',
    };
  }

  try {
    const contacts = await (navigator as any).contacts.select(['tel'], { multiple: false });
    if (!contacts || contacts.length === 0 || !contacts[0].tel || contacts[0].tel.length === 0) {
      return { isValid: false, cleanPhone: '', rawPhone: '', error: 'لم يتم اختيار أي رقم جهة اتصال.' };
    }

    const selectedTel = contacts[0].tel[0];
    return sanitizePhoneNumber(selectedTel);
  } catch (err: any) {
    return {
      isValid: false,
      cleanPhone: '',
      rawPhone: '',
      error: err.message || 'تم إلغاء اختيار جهة الاتصال.',
    };
  }
}

/**
 * Builds formatted Arabic message for a single transaction
 * Strictly excludes private account notes or internal notes
 */
export function buildTransactionShareMessage(
  tx: TransactionModel,
  accountName: string,
  currencySymbol: string
): string {
  const isOwedBy = tx.entryType === 'owedByAccount';
  const typeText = isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)';
  const amountStr = `${formatMinorAmount(tx.amountMinor)} ${currencySymbol}`;

  let msg = `راكان بلانس | RAKAN BALANCE\n`;
  msg += `الطرف: ${accountName}\n`;
  msg += `التاريخ: ${tx.date}\n`;
  msg += `نوع الحركة: ${typeText}\n`;
  msg += `المبلغ: ${amountStr}\n`;
  msg += `البيان: ${tx.description}`;

  return msg;
}

/**
 * Builds formatted Arabic summary message for an account statement
 */
export function buildStatementShareMessage(
  accountName: string,
  fromDate: string,
  toDate: string,
  statement: {
    openingBalanceMinor: number;
    closingBalanceMinor: number;
    totalOwedByMinor: number;
    totalOwedToMinor: number;
  },
  currencySymbol: string
): string {
  const openingStr = formatCurrency(statement.openingBalanceMinor, { showSign: true, symbol: currencySymbol });
  const closingStr = formatCurrency(statement.closingBalanceMinor, { showSign: true, symbol: currencySymbol });
  const totalOwedByStr = `+${formatMinorAmount(statement.totalOwedByMinor)} ${currencySymbol}`;
  const totalOwedToStr = `-${formatMinorAmount(statement.totalOwedToMinor)} ${currencySymbol}`;

  let msg = `راكان بلانس | RAKAN BALANCE\n`;
  msg += `كشف حساب: ${accountName}\n`;
  msg += `الفترة: من ${fromDate || 'بداية التعامل'} إلى ${toDate || 'تاريخ اليوم'}\n`;
  msg += `--------------------------------\n`;
  msg += `رصيد أول المدة: ${openingStr}\n`;
  msg += `إجمالي عليه (لك): ${totalOwedByStr}\n`;
  msg += `إجمالي له (عليك): ${totalOwedToStr}\n`;
  msg += `--------------------------------\n`;
  msg += `الرصيد الختامي: ${closingStr}`;

  return msg;
}

/**
 * Generates official WhatsApp URL
 */
export function getWhatsAppUrl(text: string, phoneNumDigits?: string): string {
  const encodedText = encodeURIComponent(text);
  if (phoneNumDigits && sanitizePhoneNumber(phoneNumDigits).isValid) {
    return `https://wa.me/${sanitizePhoneNumber(phoneNumDigits).cleanPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Attempts native Web Share API for PDF file if supported
 */
export async function sharePdfFile(
  pdfFile: File,
  title: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title,
          text,
          files: [pdfFile],
        });
        return { success: true };
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        return { success: false, error: err.message };
      }
      return { success: false, error: 'تم إلغاء المشاركة.' };
    }
  }

  return {
    success: false,
    error: 'مشاركة الملفات المباشرة غير مدعومة في هذا المتصفح. يرجى تنزيل الكشف وإرفاقه يدوياً.',
  };
}
