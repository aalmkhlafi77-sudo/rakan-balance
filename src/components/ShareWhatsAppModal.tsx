/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Interactive WhatsApp & Statement Share Modal
 * Enforces recipient priority resolution: Registered Phone -> Web Contact Picker -> Manual Phone -> General Share.
 */

import React, { useState, useEffect } from 'react';
import {
  sanitizePhoneNumber,
  isContactPickerSupported,
  pickContactPhone,
  getWhatsAppUrl,
  PhoneValidationResult,
} from '../services/whatsapp_share_service.ts';
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
  AlertCircle,
  ExternalLink,
  Edit3,
} from 'lucide-react';

interface ShareWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountName: string;
  accountPhone?: string;
  messageText: string;
  title: string;
  onSharePdf?: () => void;
}

export const ShareWhatsAppModal: React.FC<ShareWhatsAppModalProps> = ({
  isOpen,
  onClose,
  accountName,
  accountPhone,
  messageText,
  title,
  onSharePdf,
}) => {
  const [targetMode, setTargetMode] = useState<'registered' | 'manual' | 'general'>('registered');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [validation, setValidation] = useState<PhoneValidationResult>({ isValid: false, cleanPhone: '', rawPhone: '' });
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [pickerError, setPickerError] = useState<string>('');

  // Evaluate account phone on open
  useEffect(() => {
    if (!isOpen) return;

    setPickerError('');
    setCopiedSuccess(false);

    const initialSanitized = sanitizePhoneNumber(accountPhone);
    if (initialSanitized.isValid) {
      setTargetMode('registered');
      setValidation(initialSanitized);
      setManualPhone(initialSanitized.cleanPhone);
    } else {
      setTargetMode('general');
      setValidation({ isValid: false, cleanPhone: '', rawPhone: accountPhone || '' });
      setManualPhone('');
    }
  }, [isOpen, accountPhone]);

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

  const copyText = () => {
    navigator.clipboard.writeText(messageText).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    });
  };

  if (!isOpen) return null;

  const targetPhone = targetMode === 'registered' || targetMode === 'manual'
    ? (validation.isValid ? validation.cleanPhone : undefined)
    : undefined;

  const whatsappUrl = getWhatsAppUrl(messageText, targetPhone);

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
              <p className="text-[11px] text-slate-500">الطرف: {accountName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Priority 1 Banner: Registered Number Found */}
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
            /* Priorities 2, 3, 4: Recipient Phone Selection Controls */
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                تحديد رقم المستلم في واتساب:
              </label>

              {/* Web Contact Picker API Button (Priority 2) */}
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
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{pickerError}</span>
                </div>
              )}

              {/* Manual Phone Input (Priority 3) */}
              <div>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="إدخال رقم واتساب دولي (مثال: 966501234567)"
                    value={manualPhone}
                    onChange={(e) => {
                      setTargetMode('manual');
                      handleManualPhoneChange(e.target.value);
                    }}
                    className="w-full h-10 px-3 pl-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                </div>
                {manualPhone && !validation.isValid && (
                  <p className="text-[10px] text-rose-500 mt-1">{validation.error}</p>
                )}
              </div>

              {/* Mode Toggles */}
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
                      ? 'bg-slate-800 text-white border-slate-800'
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

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-sans whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 select-all font-mono">
              {messageText}
            </div>
          </div>

          {/* Print-to-PDF fallback: this action does not share a file automatically. */}
          {onSharePdf && (
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-purple-900 dark:text-purple-200 font-medium">
                  احفظ الكشف بصيغة PDF، ثم أرفقه يدويًا في محادثة واتساب
                </span>
              </div>
              <button
                type="button"
                onClick={onSharePdf}
                className="py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>طباعة / حفظ PDF</span>
              </button>
            </div>
          )}

          {/* Primary Action Button: Launch WhatsApp */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              إلغاء
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setTimeout(() => onClose(), 600);
              }}
              className="py-2.5 px-5 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-sm shadow-green-600/30 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                {targetPhone
                  ? `فتح محادثة واتساب (${targetPhone})`
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
