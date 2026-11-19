/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Interactive WhatsApp & Statement Share Modal
 * Enforces recipient priority resolution: Registered Phone -> Web Contact Picker -> Manual Phone -> General Share.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  sanitizePhoneNumber,
  isContactPickerSupported,
  pickContactPhone,
  getWhatsAppUrl,
  getShareCapabilities,
  shareTextNatively,
  sharePdfFile,
  PhoneValidationResult,
} from '../services/whatsapp_share_service.ts';
import { downloadPdfFile } from '../services/statement_pdf_file.ts';
import {
  X,
  Send,
  UserCheck,
  Phone,
  Contact,
  Copy,
  Check,
  Share2,
  FileText,
  Download,
  AlertCircle,
  ExternalLink,
  Edit3,
  Info,
} from 'lucide-react';

interface ShareWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  accountPhone?: string;
  suggestedPhone?: string;
  messageText: string;
  title: string;
  onCreatePdf?: () => File;
  defaultTargetMode?: 'registered' | 'manual' | 'general';
  shareContext?: 'statement' | 'transaction' | 'report';
  headerSubjectLabel?: string;
}

type StatusTone = 'success' | 'info' | 'warning' | 'error';

interface ShareStatusBanner {
  tone: StatusTone;
  text: string;
}

export const ShareWhatsAppModal: React.FC<ShareWhatsAppModalProps> = ({
  isOpen,
  onClose,
  accountName,
  accountPhone,
  suggestedPhone,
  messageText,
  title,
  onCreatePdf,
  defaultTargetMode,
  shareContext = 'statement',
  headerSubjectLabel,
}) => {
  const [targetMode, setTargetMode] = useState<'registered' | 'manual' | 'general'>('registered');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [validation, setValidation] = useState<PhoneValidationResult>({ isValid: false, cleanPhone: '', rawPhone: '' });
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [pickerError, setPickerError] = useState<string>('');
  const [shareStatus, setShareStatus] = useState<ShareStatusBanner | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const actionLockRef = useRef(false);

  const capabilities = useMemo(() => {
    if (!isOpen) return getShareCapabilities();
    return getShareCapabilities();
  }, [isOpen]);

  // Evaluate recipient phone & mode on open
  useEffect(() => {
    if (!isOpen) return;

    setPickerError('');
    setShareStatus(null);
    setCopiedSuccess(false);
    actionLockRef.current = false;
    setPdfBusy(false);

    if (defaultTargetMode === 'general') {
      setTargetMode('general');
      setManualPhone('');
      setValidation({ isValid: false, cleanPhone: '', rawPhone: '' });
      return;
    }

    const initialSanitized = sanitizePhoneNumber(accountPhone);
    if (initialSanitized.isValid) {
      setTargetMode('registered');
      setValidation(initialSanitized);
      setManualPhone(initialSanitized.cleanPhone);
    } else {
      setTargetMode(defaultTargetMode || 'manual');
      setValidation(initialSanitized);
      setManualPhone(accountPhone || '');
    }
  }, [isOpen, accountPhone, defaultTargetMode]);

  const suggestedSanitized = useMemo(
    () => (suggestedPhone ? sanitizePhoneNumber(suggestedPhone) : null),
    [suggestedPhone]
  );

  // Sync manual input changes
  const handleManualPhoneChange = (val: string) => {
    setManualPhone(val);
    const res = sanitizePhoneNumber(val);
    setValidation(res);
  };

  // Trigger Contact Picker
  const handlePickContact = async () => {
    setPickerError('');
    const res = await pickContactPhone();
    if (res.isValid) {
      setTargetMode('manual');
      setManualPhone(res.cleanPhone);
      setValidation(res);
    } else {
      setPickerError(res.error || 'فشل اختيار جهة الاتصال.');
    }
  };

  const getPdfShareTitle = (): string => {
    if (shareContext === 'report') return title;
    if (shareContext === 'transaction') return `حركة مالية: ${accountName}`;
    return `كشف حساب: ${accountName}`;
  };

  // Native PDF sharing (if supported) or clean download fallback; preserves Transient User Activation
  const handleSharePdf = async () => {
    if (!onCreatePdf || actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      // Build real PDF synchronously inside the user click gesture before calling navigator.share.
      const file = onCreatePdf();
      const liveCaps = getShareCapabilities(file);

      if (liveCaps.canSharePdfFile) {
        const res = await sharePdfFile(file, getPdfShareTitle(), messageText);
        if (res.status === 'success') {
          setShareStatus({
            tone: 'success',
            text: 'تم تسليم الملف إلى نافذة المشاركة. اختر واتساب والمستلم من الجهاز.',
          });
        } else if (res.status === 'cancelled') {
          setShareStatus({
            tone: 'info',
            text: 'تم إلغاء مشاركة الملف من الجهاز. يمكنك المحاولة مرة أخرى أو تنزيل PDF.',
          });
        } else {
          downloadPdfFile(file);
          setShareStatus({
            tone: 'warning',
            text: `${res.message} تم تنزيل الملف لتتمكن من إرفاقه في واتساب.`,
          });
        }
        return;
      }

      downloadPdfFile(file);
      setShareStatus({
        tone: 'info',
        text:
          shareContext === 'report'
            ? 'تم تنزيل التقرير بصيغة PDF. يمكنك إرفاقه في محادثة واتساب يدويًا.'
            : 'تم تنزيل كشف PDF. يمكنك إرفاق الملف في محادثة واتساب يدويًا.',
      });
    } catch (err) {
      setShareStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'تعذر إنشاء ملف PDF.',
      });
    } finally {
      actionLockRef.current = false;
      setPdfBusy(false);
    }
  };

  const handleDownloadPdfOnly = () => {
    if (!onCreatePdf || actionLockRef.current) return;
    actionLockRef.current = true;
    setPdfBusy(true);
    try {
      const file = onCreatePdf();
      downloadPdfFile(file);
      setShareStatus({
        tone: 'info',
        text:
          shareContext === 'report'
            ? 'تم تنزيل التقرير بصيغة PDF. يمكنك إرفاقه في محادثة واتساب يدويًا.'
            : 'تم تنزيل كشف PDF. يمكنك إرفاق الملف في محادثة واتساب يدويًا.',
      });
    } catch (err) {
      setShareStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'تعذر إنشاء ملف PDF.',
      });
    } finally {
      actionLockRef.current = false;
      setPdfBusy(false);
    }
  };

  // Native text share (preserves Transient User Activation by invoking navigator.share immediately)
  const handleNativeTextShare = async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      const res = await shareTextNatively({ title, text: messageText });
      if (res.status === 'success') {
        setShareStatus({ tone: 'success', text: res.message });
      } else if (res.status === 'cancelled') {
        setShareStatus({ tone: 'info', text: res.message });
      } else {
        setShareStatus({ tone: 'warning', text: res.message });
      }
    } finally {
      actionLockRef.current = false;
    }
  };

  const copyText = () => {
    if (!navigator.clipboard?.writeText) {
      setShareStatus({ tone: 'warning', text: 'النسخ التلقائي غير مدعوم هنا؛ حدد النص وانسخه يدويًا.' });
      return;
    }
    navigator.clipboard.writeText(messageText).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    }).catch(() => {
      setShareStatus({ tone: 'warning', text: 'تعذر نسخ النص تلقائيًا؛ يمكنك تحديده ونسخه يدويًا.' });
    });
  };

  if (!isOpen) return null;

  const targetPhone =
    targetMode === 'registered' || targetMode === 'manual'
      ? validation.isValid
        ? validation.cleanPhone
        : undefined
      : undefined;

  const whatsappUrl = getWhatsAppUrl(messageText, targetPhone);
  const subjectLabel = headerSubjectLabel || (shareContext === 'report' ? 'التقرير' : 'الطرف');
  const isManualPhoneMissingOrInvalid = targetMode === 'manual' && !validation.isValid;
  const openInSameFrame = capabilities.isMobileLikely || capabilities.isStandalonePwa;

  const statusToneClasses: Record<StatusTone, string> = {
    success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200',
    info: 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
    warning: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200',
    error: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden my-8 space-y-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-600 dark:text-green-400">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
              <p className="text-[11px] text-slate-500">{subjectLabel}: {accountName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة المشاركة"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Recipient Selection */}
          {targetMode === 'registered' && validation.isValid ? (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                    الرقم المسجل المعتمد للطرف:
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 text-xs dir-ltr inline-block">
                    +{validation.cleanPhone}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTargetMode('manual')}
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تغيير الرقم</span>
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {shareContext === 'report' ? 'خيارات المستلم (اختياري):' : 'تحديد رقم المستلم في واتساب:'}
                </label>
                {shareContext === 'report' && (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {targetMode === 'general' ? 'مشاركة عامة بدون رقم' : 'محدد برقم'}
                  </span>
                )}
              </div>

              {shareContext !== 'report' && !accountPhone?.trim() && (
                <p className="text-[11px] text-slate-500">لا يوجد رقم محفوظ لهذا الطرف. أدخل رقمًا دوليًا، أو اختر جهة اتصال من الجوال إذا كان جهازك يدعم ذلك.</p>
              )}
              {shareContext !== 'report' && !!accountPhone?.trim() && !sanitizePhoneNumber(accountPhone).isValid && (
                <p className="text-[11px] text-amber-600">الرقم المسجل غير مكتمل دوليًا. أدخل الرقم مع رمز الدولة لتوجيه واتساب بدقة.</p>
              )}

              {/* Optional suggestion for Parent Account Report without forcing it */}
              {shareContext === 'report' && suggestedSanitized?.isValid && (
                <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-emerald-800 dark:text-emerald-300">
                    رقم مقترح للحساب الرئيسي: <span className="font-mono dir-ltr inline-block">+{suggestedSanitized.cleanPhone}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetMode('manual');
                      setManualPhone(suggestedSanitized.cleanPhone);
                      setValidation(suggestedSanitized);
                    }}
                    className="px-2 py-1 rounded-md bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-500 cursor-pointer shrink-0"
                  >
                    استخدام الرقم
                  </button>
                </div>
              )}

              {/* Web Contact Picker API Button */}
              {isContactPickerSupported() && (
                <button
                  type="button"
                  onClick={handlePickContact}
                  className="w-full py-2 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-colors"
                >
                  <Contact className="w-4 h-4 text-purple-500" />
                  <span>اختيار جهة اتصال من الجوال (Contacts)</span>
                </button>
              )}

              {pickerError && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{pickerError}</span>
                </div>
              )}

              {/* Manual Phone Input */}
              <div>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder={
                      shareContext === 'report'
                        ? 'رقم واتساب اختياري مع رمز الدولة (مثال: 966501234567)'
                        : 'إدخال رقم واتساب دولي (مثال: 966501234567)'
                    }
                    value={manualPhone}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val.trim() && shareContext === 'report') {
                        setTargetMode('general');
                        setManualPhone('');
                        setValidation({ isValid: false, cleanPhone: '', rawPhone: '' });
                        return;
                      }
                      setTargetMode('manual');
                      handleManualPhoneChange(val);
                    }}
                    className="w-full h-10 px-3 pl-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {manualPhone && !validation.isValid && (
                  <p className="text-[10px] text-rose-500 mt-1">{validation.error}</p>
                )}
              </div>

              {/* Explicit General Share Toggle */}
              <div className="flex items-center gap-2 text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTargetMode('general');
                    setManualPhone('');
                    setValidation({ isValid: false, cleanPhone: '', rawPhone: '' });
                  }}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                    targetMode === 'general'
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-emerald-700 dark:border-emerald-700'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  مشاركة عامة بدون رقم محدد
                </button>
              </div>
            </div>
          )}

          {/* Formatted Message Preview Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                معاينة رسالة الواتساب:
              </label>
              <button
                type="button"
                onClick={copyText}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedSuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSuccess ? 'تم النسخ!' : 'نسخ النص'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-sans whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 select-all font-mono max-h-48 overflow-y-auto">
              {messageText}
            </div>
          </div>

          {/* Honest Capability-Aware PDF Action Block */}
          {onCreatePdf && (
            <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-purple-900 dark:text-purple-200 font-bold block">
                      {capabilities.canSharePdfFile
                        ? shareContext === 'report'
                          ? 'مشاركة التقرير بصيغة PDF عبر الجهاز'
                          : 'مشاركة كشف الحساب PDF عبر الجهاز'
                        : shareContext === 'report'
                        ? 'ملف التقرير PDF (تنزيل وإرفاق يدوي)'
                        : 'ملف كشف الحساب PDF (تنزيل وإرفاق يدوي)'}
                    </span>
                    <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5 leading-relaxed">
                      {capabilities.canSharePdfFile
                        ? 'عند الضغط ستظهر نافذة المشاركة الأصلية لاختيار واتساب والمستلم.'
                        : 'هذا المتصفح لا يدعم مشاركة ملفات PDF مباشرة. يمكنك تنزيل الملف ثم إرفاقه في واتساب.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {capabilities.canSharePdfFile ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadPdfOnly}
                      disabled={pdfBusy}
                      className="py-1.5 px-3 rounded-lg bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200 hover:bg-purple-100/60 dark:hover:bg-purple-900/40 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تنزيل PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleSharePdf(); }}
                      disabled={pdfBusy}
                      className="py-1.5 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{pdfBusy ? 'جارٍ إعداد PDF...' : 'مشاركة PDF عبر الجهاز'}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void handleSharePdf(); }}
                    disabled={pdfBusy}
                    className="py-1.5 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{pdfBusy ? 'جارٍ إعداد PDF...' : 'تنزيل PDF'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {shareStatus && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${statusToneClasses[shareStatus.tone]}`}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{shareStatus.text}</span>
            </div>
          )}

          {/* Action Bar: Native Share (when supported) + Direct WhatsApp Link */}
          <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              إلغاء
            </button>

            {capabilities.canShareText && (
              <button
                type="button"
                onClick={() => { void handleNativeTextShare(); }}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>مشاركة النص عبر الجهاز</span>
              </button>
            )}

            <a
              href={whatsappUrl}
              target={openInSameFrame ? undefined : '_blank'}
              aria-disabled={isManualPhoneMissingOrInvalid}
              tabIndex={isManualPhoneMissingOrInvalid ? -1 : undefined}
              rel="noopener noreferrer"
              onClick={(event) => {
                if (isManualPhoneMissingOrInvalid) {
                  event.preventDefault();
                  setPickerError('أدخل رقمًا دوليًا صحيحًا، أو اختر المشاركة العامة صراحةً.');
                  return;
                }
                setShareStatus({
                  tone: 'info',
                  text: 'تم فتح واتساب بالملخص الجاهز. يمكنك نسخ النص أو تنزيل PDF وإرفاقه عند الحاجة.',
                });
              }}
              data-ui-effect="animated-whatsapp-submit"
              className="rakan-share-motion-button py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              <Send className="rakan-share-arrow w-4 h-4" />
              <span>
                {targetPhone
                  ? `فتح محادثة واتساب (${targetPhone})`
                  : isManualPhoneMissingOrInvalid
                  ? 'أدخل رقم مستلم صحيحًا'
                  : 'فتح واتساب للمشاركة العامة'}
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
