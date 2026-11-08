/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Precise Minor Units (Halalas) Financial Arithmetic
 * Follows Document v2 Section 3 & 4 & Review Fix #1:
 * - Strictly accepts only valid numerical formats with at most 2 decimal places.
 * - Explicitly rejects malformed inputs, multiple dots, letters, >2 decimal fractions, and unsafe integers.
 * - Integer minor units prevent float rounding drift.
 */

// Maximum supported financial minor units (100 Billion SAR in Halalas = 10,000,000,000,000 Halalas)
// Well within JavaScript Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
export const MAX_SAFE_MINOR_AMOUNT = 10_000_000_000_000;

export interface MinorUnitsValidationResult {
  success: boolean;
  minor: number;
  error?: string;
}

/**
 * Validates and safely parses an input (number or string) into integer minor units (Halalas).
 * Returns { success: true, minor } or { success: false, error }.
 *
 * Rules:
 * 1. Must be finite, non-NaN, non-empty.
 * 2. If string: exactly matches ^-?\d+(\.\d{1,2})?$ (no extra dots, letters, or >2 decimals).
 * 3. Fractions exceeding 2 decimal digits are strictly rejected (e.g. 150.255, 0.001).
 * 4. Must be a safe integer within [ -MAX_SAFE_MINOR_AMOUNT, MAX_SAFE_MINOR_AMOUNT ].
 */
export function tryToMinorUnits(value: number | string): MinorUnitsValidationResult {
  if (value === null || value === undefined) {
    return { success: false, minor: 0, error: 'المبلغ غير محدد.' };
  }

  let strVal: string;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      return { success: false, minor: 0, error: 'قيمة المبلغ الرقمي غير صالحة (NaN أو غير محدد).' };
    }
    // Check if number exceeds safe integer limit
    if (Math.abs(value * 100) > MAX_SAFE_MINOR_AMOUNT) {
      return { success: false, minor: 0, error: 'المبلغ يتجاوز الحد الأقصى المسموح به للنظام.' };
    }
    // Check if number representation has more than 2 decimal digits
    // Format to 6 decimals to catch float precision like 10.001
    const parts = value.toString().split('.');
    if (parts.length > 1 && parts[1].length > 2) {
      // Check if it's true fractional digits or just IEEE representation jitter
      const rounded = Math.round(value * 100) / 100;
      if (Math.abs(value - rounded) > 1e-9) {
        return {
          success: false,
          minor: 0,
          error: 'الكسور التي تتجاوز منزلتين عشريتين (أجزاء الهللة) غير مقبولة.',
        };
      }
    }
    strVal = value.toString();
  } else if (typeof value === 'string') {
    strVal = value.trim();
  } else {
    return { success: false, minor: 0, error: 'نوع بيانات المبلغ غير مدعوم.' };
  }

  // Reject empty string or standalone sign/dot
  if (!strVal || strVal === '-' || strVal === '+' || strVal === '.') {
    return { success: false, minor: 0, error: 'يرجى إدخال مبلغ مالي صالح.' };
  }

  // Strict regex: optional leading negative sign, one or more digits, optional dot with exactly 1 or 2 digits
  // Rejects: "10.20.30", "15a0", "12.345", "--50", "10.", ".5" without leading 0, etc.
  const strictPattern = /^-?\d+(\.\d{1,2})?$/;
  if (!strictPattern.test(strVal)) {
    // Provide specific diagnostic error
    if (strVal.split('.').length > 2) {
      return { success: false, minor: 0, error: 'المدخل مشوه: يحتوي على أكثر من علامة عشرية واحدة.' };
    }
    const decParts = strVal.split('.');
    if (decParts.length === 2 && decParts[1].length > 2) {
      return {
        success: false,
        minor: 0,
        error: `الكسور التي تتجاوز منزلتين عشريتين غير مقبولة (${decParts[1].length} منازل).`,
      };
    }
    return {
      success: false,
      minor: 0,
      error: 'تنسيق المبلغ غير صالح. يرجى إدخال أرقام فقط مع منزلتين عشريتين كحد أقصى.',
    };
  }

  // Split whole and fraction
  const isNegative = strVal.startsWith('-');
  const cleanStr = isNegative ? strVal.slice(1) : strVal;
  const [wholeStr, fracStr = ''] = cleanStr.split('.');

  const wholeNum = parseInt(wholeStr, 10);
  if (!Number.isSafeInteger(wholeNum)) {
    return { success: false, minor: 0, error: 'العدد الصحيح يتجاوز الحد الآمن للذاكرة.' };
  }

  let fracNum = 0;
  if (fracStr.length === 1) {
    fracNum = parseInt(fracStr, 10) * 10;
  } else if (fracStr.length === 2) {
    fracNum = parseInt(fracStr, 10);
  }

  const rawMinor = wholeNum * 100 + fracNum;

  if (!Number.isSafeInteger(rawMinor) || rawMinor > MAX_SAFE_MINOR_AMOUNT) {
    return { success: false, minor: 0, error: 'المبلغ المحسوب بالهللات يتجاوز الحد الآمن للنظام.' };
  }

  const minor = isNegative ? -rawMinor : rawMinor;
  return { success: true, minor };
}

/**
 * Converts a decimal user input (e.g. 150.25 or "150.25") to integer minor units (15025 halalas).
 * Throws an Error on any invalid, malformed, or out-of-bounds input.
 */
export function toMinorUnits(value: number | string): number {
  const result = tryToMinorUnits(value);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.minor;
}

/**
 * Converts integer minor units (15025 halalas) back to decimal number (150.25)
 */
export function fromMinorUnits(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor / 100;
}

/**
 * Formats minor units into an Arabic or standard localized financial string with 2 decimal places.
 * Example: 15025 -> "150.25"
 */
export function formatMinorAmount(minor: number, absolute: boolean = false): string {
  const value = absolute ? Math.abs(minor) : minor;
  const decimal = (value / 100).toFixed(2);
  
  // Format with thousand separators
  const parts = decimal.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export const formatHalalaAmount = formatMinorAmount;

let activeAppCurrencySymbol = 'ر.س';

export function setActiveCurrencySymbol(symbol: string): void {
  if (symbol && symbol.trim()) {
    activeAppCurrencySymbol = symbol.trim();
  }
}

export function getActiveCurrencySymbol(): string {
  return activeAppCurrencySymbol;
}

/**
 * Formats a monetary amount with currency symbol and Arabic presentation
 * Example: 15025 -> "150.25 ر.س"
 */
export function formatCurrency(
  minor: number,
  options?: {
    symbol?: string;
    showSign?: boolean;
    absolute?: boolean;
  }
): string {
  const symbol = options?.symbol ?? activeAppCurrencySymbol;
  const absFormatted = formatMinorAmount(minor, true);
  
  if (options?.absolute) {
    return `${absFormatted} ${symbol}`;
  }

  if (minor > 0) {
    const sign = options?.showSign ? '+' : '';
    return `${sign}${absFormatted} ${symbol}`;
  } else if (minor < 0) {
    return `-${absFormatted} ${symbol}`;
  }

  return `0.00 ${symbol}`;
}

/**
 * Describes financial position in Arabic
 * B > 0 -> "لك" (مستحق لك طرف الغير)
 * B < 0 -> "عليك" (مستحق عليك للغير)
 * B = 0 -> "متوازن"
 */
export function getBalanceLabel(minor: number): {
  label: 'لك' | 'عليك' | 'متوازن';
  colorClass: string;
  badgeBg: string;
} {
  if (minor > 0) {
    return {
      label: 'لك',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (minor < 0) {
    return {
      label: 'عليك',
      colorClass: 'text-rose-600 dark:text-rose-400',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
    };
  }
  return {
    label: 'متوازن',
    colorClass: 'text-slate-500 dark:text-slate-400',
    badgeBg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  };
}
