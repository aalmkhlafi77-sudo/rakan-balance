/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Initial Setup / Onboarding Modal
 * Milestone WEB-F2: Initial setup wizard for first-time use.
 * Allows setting owner name, single local currency, and optional local PIN.
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { SUPPORTED_CURRENCIES } from '../domain/types.ts';
import {
  Sparkles,
  Coins,
  User,
  Lock,
  ShieldCheck,
  Check,
  ArrowLeft,
} from 'lucide-react';

export const FirstSetupModal: React.FC = () => {
  const { settings, completeFirstSetup } = useApp();

  const [ownerNameInput, setOwnerNameInput] = useState(settings.ownerName || 'راكان');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState(settings.currencyCode || 'SAR');
  const [enablePin, setEnablePin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If first setup is already completed, do not render modal
  if (settings.isFirstSetupDone) {
    return null;
  }

  const selectedCurrency =
    SUPPORTED_CURRENCIES.find((c) => c.code === selectedCurrencyCode) ||
    SUPPORTED_CURRENCIES[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!ownerNameInput.trim()) {
      setErrorMsg('يرجى إدخال اسم المالك.');
      return;
    }

    if (enablePin) {
      if (pinInput.length < 4 || pinInput.length > 8) {
        setErrorMsg('يجب أن يتكون رمز المرور من 4 إلى 8 أرقام.');
        return;
      }
      if (pinInput !== confirmPinInput) {
        setErrorMsg('رمز المرور وتأكيده غير متطابقين.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await completeFirstSetup(
        ownerNameInput.trim(),
        selectedCurrency.code,
        selectedCurrency.symbol,
        selectedCurrency.name,
        enablePin ? pinInput : undefined
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ التهيئة الأولى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6">
        {/* Modal Banner Header */}
        <div className="p-6 bg-gradient-to-l from-emerald-600 to-teal-700 text-white relative">
          <div className="flex items-center gap-2 text-emerald-200 text-xs font-mono font-bold mb-1">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>مرحباً بك في راكان بلانس (RAKAN BALANCE)</span>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">
            التهيئة الأولى للمنصة المالية
          </h2>
          <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
            خصص إعدادات المالك الواحد والعملة المحلية الموحدة لحساباتك. تُحفظ كافة بياناتك محلياً بدقة متناهية.
          </p>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Section 1: Owner Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>اسم المالك الواحد:</span>
            </label>
            <p className="text-[11px] text-slate-500">
              الاسم الذي يظهر في الترويسات الرسمية وكشوفات الحساب وتقارير الذمم.
            </p>
            <input
              type="text"
              value={ownerNameInput}
              onChange={(e) => setOwnerNameInput(e.target.value)}
              placeholder="مثال: راكان، أبو فهد، مؤسسة البركة..."
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
              required
            />
          </div>

          {/* Section 2: Single Local Currency */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>العملة المحلية الموحدة (مبدأ العملة الواحدة):</span>
            </label>
            <p className="text-[11px] text-slate-500">
              اختر العملة المعتمدة لحساباتك. الدقة الحسابية مثبتة على منزلتين عشريتين بدقة الهللة / الفلس بأعداد صحيحة تمنع تراكم فروق التقريب.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
              {SUPPORTED_CURRENCIES.map((c) => {
                const isSelected = selectedCurrencyCode === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSelectedCurrencyCode(c.code)}
                    className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-bold text-xs">{c.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 mt-1">
                      {c.code} ({c.symbol})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Optional Local PIN Lock */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  قفل الواجهة المحلي برقم PIN (اختياري)
                </span>
              </div>
              <input
                type="checkbox"
                id="enablePinToggle"
                checked={enablePin}
                onChange={(e) => setEnablePin(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {enablePin ? (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[11px] text-slate-500">
                  أدخل رمزاً رقمياً مكوناً من 4 إلى 8 أرقام لحماية الشاشة عند ترك الجهاز:
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="رمز المرور (4 - 8 أرقام)"
                    maxLength={8}
                    className="w-full h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-center tracking-widest text-slate-900 dark:text-slate-100"
                    required={enablePin}
                  />
                  <input
                    type="password"
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value)}
                    placeholder="تأكيد رمز المرور"
                    maxLength={8}
                    className="w-full h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono text-center tracking-widest text-slate-900 dark:text-slate-100"
                    required={enablePin}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                يمكنك تفعيل القفل المحلي في أي وقت لاحقاً من شاشة الإعدادات.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-emerald-600/20"
            >
              <span>بدء استخدام راكان بلانس</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
