/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Precise Minor Units (Halalas) Financial Arithmetic
 * Follows Document v2 Section 3 & 4: Integer minor units to prevent float rounding errors.
 */

/**
 * Converts a decimal user input (e.g. 150.25 or "150.25") to integer minor units (15025 halalas)
 * Handles up to 2 decimal places with strict integer math.
 */
export function toMinorUnits(value: number | string): number {
  if (typeof value === 'number') {
    if (isNaN(value)) return 0;
    // Round to avoid IEEE 754 precision issues like 150.25 * 100 = 15024.999999999998
    return Math.round(value * 100);
  }

  const sanitized = value.trim().replace(/[^\d.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === '.') return 0;

  const parts = sanitized.split('.');
  const wholePart = parseInt(parts[0] || '0', 10);
  const isNegative = wholePart < 0 || sanitized.startsWith('-');

  if (parts.length === 1) {
    return wholePart * 100;
  }

  // Fraction up to 2 digits
  let fractionPart = parts[1].slice(0, 2);
  if (fractionPart.length === 1) fractionPart += '0';
  const fractionNum = parseInt(fractionPart, 10);

  const total = Math.abs(wholePart) * 100 + fractionNum;
  return isNegative ? -total : total;
}

/**
 * Converts integer minor units (15025 halalas) back to decimal number (150.25)
 */
export function fromMinorUnits(minor: number): number {
  return (minor || 0) / 100;
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
  const symbol = options?.symbol ?? 'ر.س';
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
