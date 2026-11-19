/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — WhatsApp & Statement Sharing Service
 * Sanitizes international phone numbers, formats transaction & statement summaries,
 * integrates Web Contact Picker API & Web Share API with 100% offline fallbacks.
 */

import type { TransactionModel } from '../domain/types.ts';
import type {
  AccountsBalanceReport,
  CategorySummaryReport,
  DebtorsCreditorsReport,
  NormalizedReportScope,
  PeriodSummaryReport,
} from '../domain/financial_reports.ts';
import type {
  HierarchicalAccountsReport,
  ParentAccountPeriodReport,
} from '../domain/hierarchical_accounts.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import { createFinancialReportPdf } from './statement_pdf_file.ts';

export interface PhoneValidationResult {
  isValid: boolean;
  cleanPhone: string;
  rawPhone: string;
  error?: string;
}

export type ShareResultStatus = 'success' | 'cancelled' | 'unsupported' | 'notAllowed' | 'failed';

export interface ShareActionResult {
  status: ShareResultStatus;
  success: boolean;
  message: string;
  error?: string;
  technicalReason?: string;
  fallbackRecommended?: boolean;
}

export interface ShareCapabilities {
  isSecureContext: boolean;
  hasNavigatorShare: boolean;
  hasNavigatorCanShare: boolean;
  canShareText: boolean;
  canSharePdfFile: boolean;
  isMobileLikely: boolean;
  isStandalonePwa: boolean;
  userActivationActive: boolean | null;
  reason?: string;
  pdfReason?: string;
}

function logShareDevDiagnostic(event: string, payload: Record<string, unknown>): void {
  const isDev = typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  if (isDev) {
    console.debug(`[RAKAN Share] ${event}`, payload);
  }
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
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as any).contacts;
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
      error: err?.message || 'تم إلغاء اختيار جهة الاتصال.',
    };
  }
}

/**
 * Probes actual Web Share API capabilities on the active device/browser without assumptions.
 * Device hints (isMobileLikely / isStandalonePwa) are used strictly for UI ergonomics and never block supported APIs.
 */
export function getShareCapabilities(samplePdfFile?: File): ShareCapabilities {
  const isSecureContext = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const hasNavigatorShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasNavigatorCanShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  const userActivationActive =
    typeof navigator !== 'undefined' && 'userActivation' in navigator && (navigator as any).userActivation
      ? Boolean((navigator as any).userActivation.isActive)
      : null;

  const isStandalonePwa =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      Boolean(typeof navigator !== 'undefined' && (navigator as any).standalone));

  const isMobileLikely =
    typeof navigator !== 'undefined' &&
    (Boolean((navigator as any).userAgentData?.mobile) ||
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ''));

  const canShareText = isSecureContext && hasNavigatorShare;

  let canSharePdfFile = false;
  if (isSecureContext && hasNavigatorShare && hasNavigatorCanShare) {
    try {
      const probe =
        samplePdfFile ??
        (typeof File !== 'undefined'
          ? new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], 'rakan-probe.pdf', {
              type: 'application/pdf',
            })
          : undefined);
      if (probe) {
        canSharePdfFile = Boolean(navigator.canShare({ files: [probe] }));
      }
    } catch {
      canSharePdfFile = false;
    }
  }

  let reason: string | undefined;
  let pdfReason: string | undefined;

  if (!isSecureContext) {
    reason = 'ميزة المشاركة الأصلية تتطلب اتصالاً آمناً (HTTPS).';
    pdfReason = reason;
  } else if (!hasNavigatorShare) {
    reason = 'المتصفح الحالي لا يدعم نافذة المشاركة الأصلية للجهاز.';
    pdfReason = 'المتصفح الحالي لا يدعم مشاركة الملفات مباشرة.';
  } else if (!canSharePdfFile) {
    pdfReason = 'هذا المتصفح لا يدعم مشاركة ملفات PDF مباشرة عبر نافذة المشاركة.';
  }

  return {
    isSecureContext,
    hasNavigatorShare,
    hasNavigatorCanShare,
    canShareText,
    canSharePdfFile,
    isMobileLikely,
    isStandalonePwa,
    userActivationActive,
    reason,
    pdfReason,
  };
}

/**
 * Triggers native Web Share API for text summary (called synchronously inside click handler).
 */
export async function shareTextNatively(params: {
  title: string;
  text: string;
  url?: string;
}): Promise<ShareActionResult> {
  const caps = getShareCapabilities();
  logShareDevDiagnostic('shareTextNatively:start', {
    isSecureContext: caps.isSecureContext,
    hasNavigatorShare: caps.hasNavigatorShare,
    userActivationActive: caps.userActivationActive,
    isStandalonePwa: caps.isStandalonePwa,
  });

  if (!caps.canShareText) {
    const fallbackMessage = caps.reason || 'المشاركة الأصلية غير مدعومة في هذا المتصفح.';
    return {
      status: 'unsupported',
      success: false,
      message: fallbackMessage,
      error: fallbackMessage,
      technicalReason: !caps.isSecureContext ? 'insecure_context' : 'navigator_share_missing',
      fallbackRecommended: true,
    };
  }

  try {
    const shareData: ShareData = params.url
      ? { title: params.title, text: params.text, url: params.url }
      : { title: params.title, text: params.text };
    await navigator.share(shareData);
    return {
      status: 'success',
      success: true,
      message: 'تم فتح نافذة المشاركة في الجهاز. اختر واتساب لإرسال الملخص.',
    };
  } catch (err: any) {
    const errName = err?.name || 'ShareError';
    logShareDevDiagnostic('shareTextNatively:error', { errName, message: err?.message });
    if (errName === 'AbortError') {
      return {
        status: 'cancelled',
        success: false,
        message: 'تم إلغاء المشاركة من الجهاز.',
        technicalReason: 'AbortError',
      };
    }
    if (errName === 'NotAllowedError') {
      const msg = 'تعذر فتح نافذة المشاركة في الجهاز (NotAllowedError). استخدم زر فتح واتساب مباشرة أو انسخ النص.';
      return {
        status: 'notAllowed',
        success: false,
        message: msg,
        error: msg,
        technicalReason: 'NotAllowedError',
        fallbackRecommended: true,
      };
    }
    const msg = 'تعذر فتح نافذة المشاركة الأصلية، يمكنك فتح واتساب مباشرة أو نسخ النص.';
    return {
      status: 'failed',
      success: false,
      message: msg,
      error: msg,
      technicalReason: errName,
      fallbackRecommended: true,
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
 * Attempts native Web Share API for a real PDF file with strict validation & clear status codes
 */
export async function sharePdfFile(
  pdfFile: File,
  title: string,
  text = ''
): Promise<ShareActionResult> {
  if (
    !pdfFile ||
    pdfFile.type !== 'application/pdf' ||
    !pdfFile.name.toLowerCase().endsWith('.pdf') ||
    pdfFile.size <= 0
  ) {
    const msg = 'ملف PDF غير صالح أو فارغ ولا يمكن مشاركته.';
    return {
      status: 'failed',
      success: false,
      message: msg,
      error: msg,
      technicalReason: 'invalid_pdf_file',
      fallbackRecommended: true,
    };
  }

  const caps = getShareCapabilities(pdfFile);
  logShareDevDiagnostic('sharePdfFile:start', {
    fileName: pdfFile.name,
    fileSize: pdfFile.size,
    fileType: pdfFile.type,
    isSecureContext: caps.isSecureContext,
    hasNavigatorShare: caps.hasNavigatorShare,
    canSharePdfFile: caps.canSharePdfFile,
    userActivationActive: caps.userActivationActive,
  });

  if (!caps.isSecureContext || !caps.hasNavigatorShare || !caps.canSharePdfFile) {
    const msg = caps.pdfReason || 'مشاركة الملفات المباشرة غير مدعومة في هذا المتصفح. يمكنك تنزيل الملف وإرفاقه يدويًا في واتساب.';
    return {
      status: 'unsupported',
      success: false,
      message: msg,
      error: msg,
      technicalReason: !caps.isSecureContext
        ? 'insecure_context'
        : !caps.hasNavigatorShare
        ? 'navigator_share_missing'
        : 'canShare_files_false',
      fallbackRecommended: true,
    };
  }

  try {
    const sharePayload: ShareData = text
      ? { title, text, files: [pdfFile] }
      : { title, files: [pdfFile] };
    await navigator.share(sharePayload);
    return {
      status: 'success',
      success: true,
      message: 'تم تسليم الملف إلى نافذة المشاركة. اختر واتساب والمستلم من الجهاز.',
    };
  } catch (err: any) {
    const errName = err?.name || 'ShareError';
    logShareDevDiagnostic('sharePdfFile:error', { errName, message: err?.message });
    if (errName === 'AbortError') {
      return {
        status: 'cancelled',
        success: false,
        message: 'تم إلغاء مشاركة الملف من الجهاز.',
        technicalReason: 'AbortError',
      };
    }
    if (errName === 'NotAllowedError') {
      const msg = 'رفض المتصفح نافذة مشاركة الملفات (NotAllowedError). يرجى تنزيل التقرير PDF وإرفاقه يدويًا في واتساب.';
      return {
        status: 'notAllowed',
        success: false,
        message: msg,
        error: msg,
        technicalReason: 'NotAllowedError',
        fallbackRecommended: true,
      };
    }
    const msg = 'تعذر إرسال ملف PDF عبر نافذة المشاركة. يمكنك تنزيله وإرفاقه يدويًا في واتساب.';
    return {
      status: 'failed',
      success: false,
      message: msg,
      error: msg,
      technicalReason: errName,
      fallbackRecommended: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Financial Reports Unified Share Payloads (Pure, Zero Financial Mutation, Privacy-Safe)
// ---------------------------------------------------------------------------

export type ShareableReportKey =
  | 'accounts'
  | 'hierarchical'
  | 'parent_branch'
  | 'categories'
  | 'period'
  | 'debtors_creditors';

export interface ReportSharePayload {
  reportKey: ShareableReportKey;
  title: string;
  reportName: string;
  periodLabel: string;
  messageText: string;
  suggestedAccountName?: string;
  suggestedPhone?: string;
  pdfFileFactory: () => File;
}

function formatReportPeriodLabel(scope: NormalizedReportScope, cutoffOnly = false): string {
  if (cutoffOnly) {
    return scope.toDate ? `حتى تاريخ ${scope.toDate}` : 'جميع الفترات';
  }
  if (scope.fromDate || scope.toDate) {
    return `من ${scope.fromDate || 'البداية'} إلى ${scope.toDate || 'تاريخ اليوم'}`;
  }
  return 'جميع الفترات';
}

function formatStatusLabel(status: NormalizedReportScope['status']): string {
  return status === 'active' ? 'نشطة' : status === 'archived' ? 'مؤرشفة' : 'الكل';
}

export function buildAccountsReportShareMessage(
  report: AccountsBalanceReport,
  currencySymbol: string
): string {
  const periodLabel = formatReportPeriodLabel(report.appliedScope);
  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    'تقرير أرصدة الحسابات والأطراف',
    `الفترة: ${periodLabel} | الحالة: ${formatStatusLabel(report.appliedScope.status)}`,
    '--------------------------------',
    `الحسابات المشمولة: ${report.totalScopedAccountsCount}`,
    `إجمالي لك: ${formatCurrency(report.totalReceivableMinor, { symbol: currencySymbol })}`,
    `إجمالي عليك: ${formatCurrency(report.totalPayableMinor, { symbol: currencySymbol })}`,
    `الصافي: ${formatCurrency(report.netBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
  ];

  const topHighlights = [...report.rows]
    .filter((r) => r.currentBalanceMinor !== 0)
    .sort((a, b) => Math.abs(b.currentBalanceMinor) - Math.abs(a.currentBalanceMinor))
    .slice(0, 3);

  if (topHighlights.length > 0) {
    lines.push('--------------------------------');
    lines.push('أبرز الحسابات:');
    topHighlights.forEach((row) => {
      lines.push(`• ${row.account.name}: ${formatCurrency(row.currentBalanceMinor, { showSign: true, symbol: currencySymbol })}`);
    });
  }

  lines.push('--------------------------------');
  lines.push('يتوفر التقرير التفصيلي بصيغة PDF.');
  return lines.join('\n');
}

export function buildHierarchicalReportShareMessage(
  report: HierarchicalAccountsReport,
  currencySymbol: string
): string {
  const periodLabel = formatReportPeriodLabel(report.appliedScope);
  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    'تقرير الحسابات الرئيسية والفروع',
    `الفترة: ${periodLabel} | الحالة: ${formatStatusLabel(report.appliedScope.status)}`,
    '--------------------------------',
    `عدد الحسابات الرئيسية: ${report.rootAccountsCount} | الفروع والتوابع: ${report.branchAccountsCount}`,
    `إجمالي لك (مباشر): ${formatCurrency(report.totalDirectReceivableMinor, { symbol: currencySymbol })}`,
    `إجمالي عليك (مباشر): ${formatCurrency(report.totalDirectPayableMinor, { symbol: currencySymbol })}`,
    `رصيد أول الفترة: ${formatCurrency(report.totalOpeningAtPeriodMinor, { showSign: true, symbol: currencySymbol })}`,
    `رصيد آخر الفترة: ${formatCurrency(report.totalClosingDirectBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
    '--------------------------------',
    'يتوفر التقرير الشامل التفصيلي بصيغة PDF.',
  ];
  return lines.join('\n');
}

export function buildParentAccountReportShareMessage(
  report: ParentAccountPeriodReport,
  currencySymbol: string
): string {
  const rootName = report.rootAccount?.name || 'حساب رئيسي';
  const periodLabel = formatReportPeriodLabel(report.appliedScope);
  const modeLabel = report.mode === 'summary' ? 'ملخص' : 'تفصيلي';
  const s = report.summary;

  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    `تقرير الحساب الرئيسي والفروع: ${rootName}`,
    `الفترة: ${periodLabel}`,
    `الوضع: ${modeLabel} | الحسابات التابعة الفعالة: ${s.activeBranchesCount}`,
    '--------------------------------',
    `رصيد أول الفترة: ${formatCurrency(s.openingAtPeriodMinor, { showSign: true, symbol: currencySymbol })}`,
    `إجمالي عليه خلال الفترة: ${formatCurrency(s.owedByMinor, { symbol: currencySymbol })}`,
    `إجمالي له خلال الفترة: ${formatCurrency(s.owedToMinor, { symbol: currencySymbol })}`,
    `صافي الحركة: ${formatCurrency(s.netMovementMinor, { showSign: true, symbol: currencySymbol })}`,
    `رصيد آخر الفترة (${s.balanceTypeLabel}): ${formatCurrency(s.closingBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
  ];

  if (report.mode === 'detailed' && report.branchRows.length > 0) {
    lines.push('--------------------------------');
    lines.push('ملخص أرصدة الفروع:');
    report.branchRows.slice(0, 5).forEach((branch) => {
      lines.push(
        `• ${branch.displayName}: ${formatCurrency(branch.closingBalanceMinor, { showSign: true, symbol: currencySymbol })} (${branch.balanceTypeLabel})`
      );
    });
    if (report.branchRows.length > 5) {
      lines.push(`• وعدد ${report.branchRows.length - 5} فروع أخرى في ملف PDF.`);
    }
  }

  lines.push('--------------------------------');
  lines.push('يتوفر التقرير التفصيلي بصيغة PDF.');
  return lines.join('\n');
}

export function buildCategoriesReportShareMessage(
  report: CategorySummaryReport,
  currencySymbol: string
): string {
  const periodLabel = formatReportPeriodLabel(report.appliedScope);
  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    'تقرير توزيع الأرصدة حسب التصنيفات',
    `الفترة: ${periodLabel} | التصنيفات: ${report.rows.length} | الحسابات: ${report.includedAccountsCount}`,
    '--------------------------------',
    `إجمالي لك: ${formatCurrency(report.grandTotalReceivableMinor, { symbol: currencySymbol })}`,
    `إجمالي عليك: ${formatCurrency(report.grandTotalPayableMinor, { symbol: currencySymbol })}`,
    `الصافي العام: ${formatCurrency(report.grandNetBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
  ];

  if (report.rows.length > 0) {
    lines.push('--------------------------------');
    lines.push('أبرز التصنيفات:');
    report.rows.slice(0, 5).forEach((row) => {
      lines.push(
        `• ${row.category.name}: الصافي ${formatCurrency(row.netBalanceMinor, { showSign: true, symbol: currencySymbol })}`
      );
    });
  }

  lines.push('--------------------------------');
  lines.push('يتوفر التقرير التفصيلي بصيغة PDF.');
  return lines.join('\n');
}

export function buildPeriodReportShareMessage(
  report: PeriodSummaryReport,
  currencySymbol: string
): string {
  const periodLabel = formatReportPeriodLabel(report.appliedScope);
  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    'تقرير حركة الفترة الزمانية',
    `الفترة: ${periodLabel} | عدد الحركات: ${report.transactionsCount}`,
    '--------------------------------',
    `الرصيد الافتتاحي السابق: ${formatCurrency(report.openingBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
    `إجمالي عليه خلال الفترة: ${formatCurrency(report.totalOwedByMinor, { symbol: currencySymbol })}`,
    `إجمالي له خلال الفترة: ${formatCurrency(report.totalOwedToMinor, { symbol: currencySymbol })}`,
    `التغير الصافي: ${formatCurrency(report.periodNetChangeMinor, { showSign: true, symbol: currencySymbol })}`,
    `الرصيد الختامي الإجمالي: ${formatCurrency(report.closingBalanceMinor, { showSign: true, symbol: currencySymbol })}`,
    '--------------------------------',
    'يتوفر سجل الحركات التفصيلي بصيغة PDF.',
  ];
  return lines.join('\n');
}

export function buildDebtorsCreditorsReportShareMessage(
  report: DebtorsCreditorsReport,
  currencySymbol: string
): string {
  const periodLabel = formatReportPeriodLabel(report.appliedScope, true);
  const lines = [
    'راكان بلانس | RAKAN BALANCE',
    'تقرير تحليل الأطراف والتركز (لك / عليك)',
    `النطاق: ${periodLabel} | الحالة: ${formatStatusLabel(report.appliedScope.status)}`,
    '--------------------------------',
    `إجمالي حقوقك (لك): ${formatCurrency(report.totalDebtorsMinor, { symbol: currencySymbol })} (${report.totalDebtorsCount} مدين)`,
    `إجمالي التزاماتك (عليك): ${formatCurrency(report.totalCreditorsMinor, { symbol: currencySymbol })} (${report.totalCreditorsCount} دائن)`,
  ];

  if (report.topDebtorName) {
    lines.push(`أعلى مدين: ${report.topDebtorName} (${formatCurrency(report.topDebtorAmountMinor, { symbol: currencySymbol })})`);
  }
  if (report.topCreditorName) {
    lines.push(`أعلى دائن: ${report.topCreditorName} (${formatCurrency(report.topCreditorAmountMinor, { symbol: currencySymbol })})`);
  }

  lines.push('--------------------------------');
  lines.push('يتوفر التقرير التفصيلي بصيغة PDF.');
  return lines.join('\n');
}

export type BuildReportSharePayloadInput =
  | {
      reportKey: 'accounts';
      report: AccountsBalanceReport;
      ownerName: string;
      currencySymbol: string;
    }
  | {
      reportKey: 'hierarchical';
      report: HierarchicalAccountsReport;
      ownerName: string;
      currencySymbol: string;
    }
  | {
      reportKey: 'parent_branch';
      report: ParentAccountPeriodReport;
      ownerName: string;
      currencySymbol: string;
    }
  | {
      reportKey: 'categories';
      report: CategorySummaryReport;
      ownerName: string;
      currencySymbol: string;
    }
  | {
      reportKey: 'period';
      report: PeriodSummaryReport;
      ownerName: string;
      currencySymbol: string;
    }
  | {
      reportKey: 'debtors_creditors';
      report: DebtorsCreditorsReport;
      ownerName: string;
      currencySymbol: string;
    };

export function buildReportSharePayload(input: BuildReportSharePayloadInput): ReportSharePayload {
  const { currencySymbol, ownerName } = input;

  switch (input.reportKey) {
    case 'accounts': {
      const r = input.report;
      const periodLabel = formatReportPeriodLabel(r.appliedScope);
      return {
        reportKey: 'accounts',
        reportName: 'تقرير أرصدة الحسابات والأطراف',
        title: 'مشاركة تقرير أرصدة الحسابات',
        periodLabel,
        messageText: buildAccountsReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'accounts',
            reportTitle: 'تقرير أرصدة الحسابات والأطراف',
            subtitle: `الحسابات: ${r.totalScopedAccountsCount} | المستبعدة: ${r.excludedDormantCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'إجمالي لك', value: formatCurrency(r.totalReceivableMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'إجمالي عليك', value: formatCurrency(r.totalPayableMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'الصافي', value: formatCurrency(r.netBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'blue' },
              { label: 'عدد الحسابات', value: String(r.totalScopedAccountsCount), tone: 'slate' },
            ],
            columns: ['الحساب', 'التصنيف', 'رصيد أول الفترة', 'عليه', 'له', 'رصيد آخر الفترة', 'الحالة'],
            rows: r.rows.map((row) => [
              row.account.name,
              row.categoryName,
              formatCurrency(row.openingAtPeriodMinor, { symbol: currencySymbol }),
              formatCurrency(row.totalOwedByMinor, { symbol: currencySymbol }),
              formatCurrency(row.totalOwedToMinor, { symbol: currencySymbol }),
              formatCurrency(row.currentBalanceMinor, { showSign: true, symbol: currencySymbol }),
              row.balanceType === 'receivable' ? 'لك' : row.balanceType === 'payable' ? 'عليك' : 'متزن',
            ]),
          }),
      };
    }

    case 'hierarchical': {
      const r = input.report;
      const periodLabel = formatReportPeriodLabel(r.appliedScope);
      return {
        reportKey: 'hierarchical',
        reportName: 'تقرير الحسابات الرئيسية والفروع',
        title: 'مشاركة تقرير الحسابات الرئيسية والفروع',
        periodLabel,
        messageText: buildHierarchicalReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'hierarchical',
            reportTitle: 'التقرير التنفيذي للحسابات الرئيسية والفروع',
            subtitle: `رئيسية: ${r.rootAccountsCount} | فروع: ${r.branchAccountsCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'إجمالي لك (مباشر)', value: formatCurrency(r.totalDirectReceivableMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'إجمالي عليك (مباشر)', value: formatCurrency(r.totalDirectPayableMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'رصيد أول الفترة', value: formatCurrency(r.totalOpeningAtPeriodMinor, { symbol: currencySymbol }), tone: 'slate' },
              { label: 'رصيد آخر الفترة', value: formatCurrency(r.totalClosingDirectBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'blue' },
            ],
            columns: ['الحساب', 'رصيد أول الفترة', 'عليه', 'له', 'الرصيد المباشر', 'الرصيد المجمع'],
            rows: r.rows.map((row) => [
              `${'— '.repeat(row.level)}${row.account.name}`,
              formatCurrency(row.openingAtPeriodMinor, { symbol: currencySymbol }),
              formatCurrency(row.directOwedByMinor, { symbol: currencySymbol }),
              formatCurrency(row.directOwedToMinor, { symbol: currencySymbol }),
              formatCurrency(row.directBalanceMinor, { showSign: true, symbol: currencySymbol }),
              formatCurrency(row.consolidatedBalanceMinor, { showSign: true, symbol: currencySymbol }),
            ]),
          }),
      };
    }

    case 'parent_branch': {
      const r = input.report;
      const rootName = r.rootAccount?.name || 'حساب رئيسي';
      const periodLabel = formatReportPeriodLabel(r.appliedScope);
      const s = r.summary;
      const rawPhone = r.rootAccount?.phone;
      const suggestedPhone = rawPhone && sanitizePhoneNumber(rawPhone).isValid ? rawPhone : undefined;

      return {
        reportKey: 'parent_branch',
        reportName: `تقرير الحساب الرئيسي والفروع — ${rootName}`,
        title: `مشاركة تقرير الحساب الرئيسي: ${rootName}`,
        periodLabel,
        suggestedAccountName: rootName,
        suggestedPhone,
        messageText: buildParentAccountReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'parent_branch',
            reportTitle: `تقرير الحساب الرئيسي والفروع — ${rootName}`,
            subtitle: `الوضع: ${r.mode === 'summary' ? 'ملخص' : 'تفصيلي'} | التوابع الفعالة: ${s.activeBranchesCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'رصيد أول الفترة', value: formatCurrency(s.openingAtPeriodMinor, { showSign: true, symbol: currencySymbol }), tone: 'slate' },
              { label: 'إجمالي عليه', value: formatCurrency(s.owedByMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'إجمالي له', value: formatCurrency(s.owedToMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'رصيد آخر الفترة', value: formatCurrency(s.closingBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'blue' },
            ],
            columns: ['الحساب', 'النوع', 'أول الفترة', 'عليه', 'له', 'آخر الفترة', 'الحالة'],
            rows: r.allRows.map((row) => [
              `${row.level > 0 ? '— '.repeat(row.level) : ''}${row.displayName}`,
              row.accountTypeLabel,
              formatCurrency(row.openingAtPeriodMinor, { symbol: currencySymbol }),
              formatCurrency(row.owedByMinor, { symbol: currencySymbol }),
              formatCurrency(row.owedToMinor, { symbol: currencySymbol }),
              formatCurrency(row.closingBalanceMinor, { showSign: true, symbol: currencySymbol }),
              row.balanceTypeLabel,
            ]),
          }),
      };
    }

    case 'categories': {
      const r = input.report;
      const periodLabel = formatReportPeriodLabel(r.appliedScope);
      return {
        reportKey: 'categories',
        reportName: 'تقرير توزيع الأرصدة حسب التصنيفات',
        title: 'مشاركة تقرير التصنيفات',
        periodLabel,
        messageText: buildCategoriesReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'categories',
            reportTitle: 'تقرير توزيع الأرصدة حسب التصنيفات',
            subtitle: `التصنيفات: ${r.rows.length} | الحسابات: ${r.includedAccountsCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'إجمالي لك', value: formatCurrency(r.grandTotalReceivableMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'إجمالي عليك', value: formatCurrency(r.grandTotalPayableMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'الصافي العام', value: formatCurrency(r.grandNetBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'blue' },
              { label: 'الحسابات المشمولة', value: String(r.includedAccountsCount), tone: 'slate' },
            ],
            columns: ['اسم التصنيف', 'الحسابات', 'إجمالي لك', 'إجمالي عليك', 'الصافي'],
            rows: r.rows.map((row) => [
              row.category.name,
              row.accountsCount,
              formatCurrency(row.totalReceivableMinor, { symbol: currencySymbol }),
              formatCurrency(row.totalPayableMinor, { symbol: currencySymbol }),
              formatCurrency(row.netBalanceMinor, { showSign: true, symbol: currencySymbol }),
            ]),
          }),
      };
    }

    case 'period': {
      const r = input.report;
      const periodLabel = formatReportPeriodLabel(r.appliedScope);
      return {
        reportKey: 'period',
        reportName: 'تقرير حركة الفترة الزمانية',
        title: 'مشاركة تقرير حركة الفترة الزمانية',
        periodLabel,
        messageText: buildPeriodReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'period',
            reportTitle: 'تقرير حركة الحسابات التفصيلي للفترة',
            subtitle: `عدد الحركات: ${r.transactionsCount} | الحسابات: ${r.includedAccountsCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'الرصيد الافتتاحي', value: formatCurrency(r.openingBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'slate' },
              { label: 'إجمالي عليه', value: formatCurrency(r.totalOwedByMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'إجمالي له', value: formatCurrency(r.totalOwedToMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'الرصيد الختامي', value: formatCurrency(r.closingBalanceMinor, { showSign: true, symbol: currencySymbol }), tone: 'blue' },
            ],
            columns: ['التاريخ', 'الحساب', 'التصنيف', 'النوع', 'البيان', 'المبلغ'],
            rows: r.rows.map((row) => [
              row.transaction.date,
              row.accountName,
              row.categoryName,
              row.transaction.entryType === 'owedByAccount' ? 'عليه' : 'له',
              row.transaction.description,
              formatCurrency(row.transaction.amountMinor, { symbol: currencySymbol }),
            ]),
          }),
      };
    }

    case 'debtors_creditors': {
      const r = input.report;
      const periodLabel = formatReportPeriodLabel(r.appliedScope, true);
      return {
        reportKey: 'debtors_creditors',
        reportName: 'تقرير تحليل الأطراف والتركز (لك / عليك)',
        title: 'مشاركة تقرير تحليل لك / عليك',
        periodLabel,
        messageText: buildDebtorsCreditorsReportShareMessage(r, currencySymbol),
        pdfFileFactory: () =>
          createFinancialReportPdf({
            reportKey: 'debtors_creditors',
            reportTitle: 'تقرير تحليل الأطراف والتركز المالي (لك / عليك)',
            subtitle: `المدينون: ${r.totalDebtorsCount} | الدائنون: ${r.totalCreditorsCount}`,
            ownerName,
            periodLabel,
            currencySymbol,
            metrics: [
              { label: 'إجمالي حقوقك (لك)', value: formatCurrency(r.totalDebtorsMinor, { symbol: currencySymbol }), tone: 'emerald' },
              { label: 'أعلى مدين', value: r.topDebtorName || 'لا يوجد', tone: 'slate' },
              { label: 'إجمالي التزاماتك (عليك)', value: formatCurrency(r.totalCreditorsMinor, { symbol: currencySymbol }), tone: 'rose' },
              { label: 'أعلى دائن', value: r.topCreditorName || 'لا يوجد', tone: 'slate' },
            ],
            columns: ['الحساب', 'التصنيف', 'النوع', 'المبلغ', 'التركز'],
            rows: [
              ...r.debtors.map((d) => [
                d.account.name,
                d.categoryName,
                'مدين (لك)',
                formatCurrency(d.balanceMinor, { symbol: currencySymbol }),
                `${d.sharePercentage.toFixed(1)}%`,
              ]),
              ...r.creditors.map((c) => [
                c.account.name,
                c.categoryName,
                'دائن (عليك)',
                formatCurrency(c.absBalanceMinor, { symbol: currencySymbol }),
                `${c.sharePercentage.toFixed(1)}%`,
              ]),
            ],
          }),
      };
    }
  }
}
