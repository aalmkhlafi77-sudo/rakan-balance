/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Initial Setup / Welcome Screen Modal
 * Redesigned into Premium Financial Glass UI with emerald marble aesthetic,
 * prominent 3D Owner Login, clean Currency Dropdown, concise security badges,
 * and high-contrast tactile CTA.
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useOwnerAccess } from './OwnerAccessGate.tsx';
import { SUPPORTED_CURRENCIES } from '../domain/types.ts';
import {
  Coins,
  User,
  Lock,
  ShieldCheck,
  Shield,
  UserCheck,
  Cloud,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  Sun,
  Sparkles,
} from 'lucide-react';

export const FirstSetupModal: React.FC = () => {
  const { settings, completeFirstSetup, toggleTheme } = useApp();
  const ownerAccess = useOwnerAccess();

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
      className="welcome-screen fixed inset-0 z-50 bg-[#020b0a]/90 backdrop-blur-xl flex items-start sm:items-center justify-center p-0 sm:p-5 overflow-y-auto overscroll-contain"
      data-theme={settings.theme}
      dir="rtl"
    >
      <div className="welcome-card relative w-full max-w-4xl min-h-[100dvh] sm:min-h-0 bg-gradient-to-br from-[#0c2b26]/95 via-[#071d1a]/95 to-[#041210]/98 border-0 sm:border border-[#d8b46a]/40 rounded-none sm:rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_35px_rgba(216,180,106,0.15)] overflow-hidden my-0 sm:my-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={settings.theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الزجاجي'}
          title={settings.theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الزجاجي'}
          className="welcome-theme-toggle absolute top-3 left-3 sm:top-4 sm:left-4 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-[#d8b46a]/45 bg-[#071d1a]/78 backdrop-blur-xl text-[#e8d7a8] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_16px_rgba(0,0,0,0.35)] hover:scale-105 active:scale-95 transition-transform cursor-pointer"
        >
          {settings.theme === 'dark' ? (
            <Sun className="w-4 h-4" aria-hidden="true" />
          ) : (
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
        {/* Main 2-Column Responsive Layout: Hero Brand Area + User Setup Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[100dvh] sm:min-h-[580px]">
          
          {/* Right Column (Hero / Brand Identity / Owner Action / Feature Highlights) */}
          <div className="welcome-hero lg:col-span-5 px-5 pt-6 pb-5 sm:p-8 bg-gradient-to-b from-[#123933]/70 via-[#0a2320]/85 to-[#041513]/92 border-b lg:border-b-0 lg:border-l border-[#d8b46a]/25 flex flex-col lg:justify-between relative overflow-hidden">
            {/* Ambient specular light highlight */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#d8b46a]/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-[#b56ce8]/15 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-4 lg:space-y-6 relative z-10">
              {/* Logo Presentation with Specular Shadow */}
              <div className="pt-0 text-center lg:text-right">
                <img
                  src="/assets/rakan-logo.webp"
                  alt="راكان بلانس — RAKAN BALANCE"
                  className="block w-full max-w-[188px] sm:max-w-[220px] lg:max-w-[248px] h-auto object-contain mx-auto lg:mx-0 filter drop-shadow-[0_12px_28px_rgba(0,0,0,0.62)]"
                  width={384}
                  height={384}
                  loading="eager"
                  decoding="async"
                />
                <p className="text-[11px] sm:text-xs text-[#e3dbcb] mt-2 sm:mt-3 leading-relaxed font-semibold max-w-sm mx-auto lg:mx-0">
                  <span className="sm:hidden">دفترك المالي الشخصي — محلي كضيف أو متزامن عبر حساب المالك.</span>
                  <span className="hidden sm:inline">المنصة المستقلة لإدارة الذمم والعمليات المالية بدقة الهللة والعملة الموحدة.</span>
                </p>
              </div>

              {/* Owner Access Card Action (Requirement 5.4) */}
              {ownerAccess.status !== 'owner' && (
                <div className="hidden lg:block p-3.5 rounded-2xl bg-[#081b19]/90 border border-[#d8b46a]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-bold text-[#f8f4e8] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#d8b46a]" />
                      <span>هل لديك حساب مالك؟</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#d8b46a]/15 text-[#e8d7a8] border border-[#d8b46a]/30">
                      خاص
                    </span>
                  </div>
                  <p className="text-[11px] text-[#d7d0c2] mb-3 leading-snug">
                    يتيح تسجيل دخول المالك المعتمد مزامنة بياناتك سحابياً والوصول للمساحة المخصصة.
                  </p>
                  <button
                    type="button"
                    onClick={ownerAccess.openLogin}
                    aria-label="دخول المالك"
                    data-ui-effect="liquid-metal-owner"
                    className="rakan-liquid-metal-button w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <KeyRound className="relative z-10 w-3.5 h-3.5 text-[#fff0c7]" />
                    <span className="relative z-10">دخول المالك المعتمد</span>
                  </button>
                </div>
              )}

              {/* 4 Concise Informative Badges (Requirement 5.6) */}
              <div className="hidden lg:block space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-right">
                  <div className="w-6 h-6 rounded-lg bg-[#d8b46a]/15 border border-[#d8b46a]/30 flex items-center justify-center shrink-0 mt-0.5 text-[#e8d7a8]">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-[#f8f4e8]">بياناتك تحت سيطرتك</h4>
                    <p className="text-[10px] text-[#d7d0c2] leading-tight">تُخزن السجلات محلياً في جهازك بأمان تام دون تسريب.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-right">
                  <div className="w-6 h-6 rounded-lg bg-[#b56ce8]/15 border border-[#b56ce8]/30 flex items-center justify-center shrink-0 mt-0.5 text-[#b56ce8]">
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-[#f8f4e8]">وضع الضيف متاح فوراً</h4>
                    <p className="text-[10px] text-[#d7d0c2] leading-tight">يمكنك استخدام التطبيق محلياً كضيف بكامل الميزات دون قيود.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-right">
                  <div className="w-6 h-6 rounded-lg bg-[#34d399]/15 border border-[#34d399]/30 flex items-center justify-center shrink-0 mt-0.5 text-[#34d399]">
                    <Cloud className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-[#f8f4e8]">مساحة المالك الخاصة</h4>
                    <p className="text-[10px] text-[#d7d0c2] leading-tight">تسجيل المالك يتيح المزامنة المشفرة بين أجهزتك المختلفة.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-right">
                  <div className="w-6 h-6 rounded-lg bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center shrink-0 mt-0.5 text-[#f59e0b]">
                    <Coins className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-[#f8f4e8]">مرونة العملة</h4>
                    <p className="text-[10px] text-[#d7d0c2] leading-tight">يمكنك تغيير العملة وإعدادات العرض لاحقاً في أي وقت.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:block pt-4 mt-4 border-t border-[#d8b46a]/15 text-[10px] text-slate-400">
              راكان بلانس © 2026 · بيئة مالية مستقلة
            </div>
          </div>

          {/* Left Column (Configuration Form Area) */}
          <div className="welcome-form lg:col-span-7 p-4 sm:p-8 flex flex-col justify-between">
            <div>
              {ownerAccess.status !== 'owner' && (
                <div className="lg:hidden mb-4">
                  <div className="p-3.5 rounded-2xl bg-[#081b19]/92 border border-[#d8b46a]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_rgba(0,0,0,0.42)]">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-bold text-[#f8f4e8] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#d8b46a]" />
                        <span>مساحة المالك الخاصة</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#d8b46a]/15 text-[#e8d7a8] border border-[#d8b46a]/30">
                        مزامنة
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={ownerAccess.openLogin}
                      aria-label="دخول المالك"
                      data-ui-effect="liquid-metal-owner"
                      className="rakan-liquid-metal-button w-full py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <KeyRound className="relative z-10 w-4 h-4 text-[#fff0c7]" />
                      <span className="relative z-10">دخول المالك المعتمد</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 py-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-gradient-to-l from-[#d8b46a]/45 to-transparent" />
                    <span className="text-[10px] font-bold text-[#d7d0c2] whitespace-nowrap">أو ابدأ محليًا كضيف</span>
                    <span className="h-px flex-1 bg-gradient-to-r from-[#d8b46a]/45 to-transparent" />
                  </div>
                </div>
              )}

              <div className="mb-4 sm:mb-5 pb-3 border-b border-[#d8b46a]/20">
                <span className="text-[10px] font-bold font-mono tracking-widest text-[#d8b46a] uppercase">
                  إعدادات البدء السريع
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#f8f4e8] mt-0.5">
                  تهيئة الدفتر المالي الشخصي
                </h3>
                <p className="text-[11px] sm:text-xs text-[#d7d0c2] mt-1">
                  أدخل الاسم والعملة للبدء مباشرة. يمكنك تغيير الإعدادات لاحقًا.
                </p>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 font-medium">
                  {errorMsg}
                </div>
              )}

              <form id="firstSetupForm" onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                {/* 1. Owner Name Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#f8f4e8] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#d8b46a]" />
                    <span>اسم المالك الواحد:</span>
                  </label>
                  <input
                    type="text"
                    value={ownerNameInput}
                    onChange={(e) => setOwnerNameInput(e.target.value)}
                    placeholder="مثال: راكان، أبو فهد، مؤسسة البركة..."
                    className="w-full h-11 px-3.5 rounded-xl bg-[#061816]/90 border border-[#d8b46a]/40 focus:border-[#d8b46a] text-xs text-[#f8f4e8] placeholder:text-slate-500 font-semibold focus:outline-none focus:ring-2 focus:ring-[#d8b46a]/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] transition-all"
                    required
                  />
                  <p className="hidden sm:block text-[10px] text-[#d7d0c2]">
                    الاسم الرسمي الذي يظهر في ترويسات كشوف الحساب والتقارير المالية.
                  </p>
                </div>

                {/* 2. Single Local Currency Dropdown (Requirement 5.5) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#f8f4e8] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-[#e8d7a8]" />
                      <span>العملة المحلية الموحدة:</span>
                    </span>
                    <span className="hidden sm:inline text-[10px] font-mono text-[#d8b46a]">
                      مبدأ العملة الواحدة (منزلتين عشريتين)
                    </span>
                  </label>
                  
                  <div className="relative">
                    <select
                      value={selectedCurrencyCode}
                      onChange={(e) => setSelectedCurrencyCode(e.target.value)}
                      className="w-full h-11 px-3.5 pr-3.5 rounded-xl bg-[#061816]/95 border border-[#d8b46a]/45 focus:border-[#d8b46a] text-xs font-semibold text-[#f8f4e8] focus:outline-none focus:ring-2 focus:ring-[#d8b46a]/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] cursor-pointer transition-all"
                      style={{ colorScheme: 'dark' }}
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option
                          key={c.code}
                          value={c.code}
                          className="bg-[#081b19] text-[#f8f4e8] py-1.5"
                        >
                          {c.name} — {c.code} — ({c.symbol})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="hidden sm:block text-[10px] text-[#d7d0c2]">
                    العملة المختارة: <span className="font-bold text-[#e8d7a8]">{selectedCurrency.name}</span> بحساب الهللات والكسور بأعداد صحيحة تمنع فروق التقريب.
                  </p>
                </div>

                {/* 3. Compact Optional Local PIN (Requirement 5.7) */}
                <div className="p-3.5 rounded-2xl bg-[#061816]/80 border border-[#d8b46a]/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#d8b46a]" />
                      <span className="text-xs font-bold text-[#f8f4e8]">
                        قفل الواجهة برقم PIN محلي (اختياري)
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePin}
                        onChange={(e) => setEnablePin(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#d8b46a]"></div>
                    </label>
                  </div>

                  {enablePin ? (
                    <div className="space-y-2 pt-2 border-t border-[#d8b46a]/20">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="password"
                          value={pinInput}
                          onChange={(e) => setPinInput(e.target.value)}
                          placeholder="رمز المرور (4-8 أرقام)"
                          maxLength={8}
                          className="w-full h-9 px-3 rounded-xl bg-[#041210] border border-[#d8b46a]/40 text-xs font-mono text-center tracking-widest text-[#f8f4e8] focus:border-[#d8b46a] focus:outline-none"
                          required={enablePin}
                        />
                        <input
                          type="password"
                          value={confirmPinInput}
                          onChange={(e) => setConfirmPinInput(e.target.value)}
                          placeholder="تأكيد الرمز"
                          maxLength={8}
                          className="w-full h-9 px-3 rounded-xl bg-[#041210] border border-[#d8b46a]/40 text-xs font-mono text-center tracking-widest text-[#f8f4e8] focus:border-[#d8b46a] focus:outline-none"
                          required={enablePin}
                        />
                      </div>
                      <p className="text-[10px] text-[#d7d0c2]">
                        يُقفل التطبيق تلقائياً عند طلب القفل لمنع المتطفلين من الاطلاع على الأرصدة.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      يمكنك تفعيل رمز المرور في أي وقت لاحقاً من شاشة الإعدادات.
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Primary Action Button: Beso 3D Glass CTA (Requirement 5.8) */}
            <div className="pt-4 sm:pt-5 mt-3 sm:mt-4 border-t border-[#d8b46a]/20">
              <button
                type="submit"
                form="firstSetupForm"
                disabled={isSubmitting}
                data-ui-effect="cosmic-glass-start"
                className="rakan-cosmic-glass-button w-full px-6 text-sm font-bold flex items-center justify-center gap-3 cursor-pointer"
              >
                <span className="rakan-cosmic-orb" aria-hidden="true" />
                <span className="rakan-cosmic-content flex items-center justify-center gap-2">
                  <span>{isSubmitting ? 'جاري تجهيز الدفتر...' : 'بدء استخدام راكان بلانس'}</span>
                  <ArrowLeft className="w-4 h-4 text-[#e8d7a8]" />
                </span>
              </button>
              <p className="lg:hidden mt-3 text-center text-[10px] text-[#bfc7c2]">
                محلي كضيف • مزامنة خاصة للمالك • بياناتك تحت سيطرتك
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
