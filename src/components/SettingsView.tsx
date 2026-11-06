/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Settings & Dart Export View
 * Owner profile, single currency lock, local PIN security, browser storage notice, and Flutter Dart code specs
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  DART_ACCOUNT_MODEL_SOURCE,
  DART_BALANCE_CALCULATOR_SOURCE,
  DART_TRANSACTION_MODEL_SOURCE,
} from '../domain/dart_export_spec.ts';
import {
  Settings,
  Lock,
  ShieldAlert,
  Coins,
  User,
  Copy,
  Check,
  Code2,
  FileCode,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateOwnerName,
    hasPinSet,
    setupPin,
    removePin,
  } = useApp();

  const [ownerInput, setOwnerInput] = useState(settings.ownerName);
  const [ownerSaved, setOwnerSaved] = useState(false);

  // PIN Setup State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Remove PIN state
  const [removePinInput, setRemovePinInput] = useState('');
  const [removeError, setRemoveError] = useState('');

  // Active Dart spec tab
  const [activeDartTab, setActiveDartTab] = useState<'account' | 'transaction' | 'calculator'>('calculator');
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const handleSaveOwner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerInput.trim()) return;
    updateOwnerName(ownerInput.trim());
    setOwnerSaved(true);
    setTimeout(() => setOwnerSaved(false), 2500);
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (newPin.length < 4 || newPin.length > 8) {
      setPinError('يجب أن يتكون رمز المرور من 4 إلى 8 أرقام.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('رمزا المرور غير متطابقين.');
      return;
    }

    await setupPin(newPin);
    setNewPin('');
    setConfirmPin('');
    setPinSuccess('تم تعيين قفل الواجهة المحلي بنجاح.');
    setTimeout(() => setPinSuccess(''), 3000);
  };

  const handleRemovePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemoveError('');
    const ok = await removePin(removePinInput);
    if (!ok) {
      setRemoveError('رمز المرور الحالي غير صحيح.');
    } else {
      setRemovePinInput('');
    }
  };

  const copyDartSource = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedTab(id);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          الإعدادات ومواصفات التصدير لـ Flutter
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          إدارة إعدادات المالك الواحد، الأمان المحلي، وشيفرة Dart النقية المتوافقة مع Android وiOS
        </p>
      </div>

      {/* Grid: Profile & Currency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Owner Profile Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                بيانات المالك الواحد
              </h3>
              <p className="text-[11px] text-slate-500">
                الاسم الظاهر في الترويسات والتقارير
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveOwner} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                اسم المالك:
              </label>
              <input
                type="text"
                value={ownerInput}
                onChange={(e) => setOwnerInput(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              {ownerSaved ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  تم حفظ الاسم بنجاح
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="py-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
              >
                حفظ
              </button>
            </div>
          </form>
        </div>

        {/* Currency Rule Card */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                العملة المحلية الموحدة
              </h3>
              <p className="text-[11px] text-slate-500">
                سياسة العملة الواحدة الصارمة (Document v2)
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">العملة المعتمدة:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                ريال سعودي (SAR) — ر.س
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">الدقة الحسابية:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                100 هللة (أعداد صحيحة Minor Units)
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            وفق ميثاق العمل، لا يدعم التطبيق تعدد العملات أو أسعار الصرف المتذبذبة لضمان بساطة الحسابات الشخصية واستقرار الأرصدة.
          </p>
        </div>
      </div>

      {/* Local PIN Security Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              قفل الواجهة المحلي (PIN Security)
            </h3>
            <p className="text-[11px] text-slate-500">
              حماية الشاشة والجلسة من المتطفلين على نفس الجهاز
            </p>
          </div>
        </div>

        {hasPinSet ? (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>قفل الواجهة مفعل برمز مرور محلي مشفر ومملح (Salted SHA-256).</span>
            </div>

            <form onSubmit={handleRemovePin} className="max-w-sm space-y-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                لإلغاء قفل المرور، أدخل الرمز الحالي:
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="رمز المرور الحالي"
                  value={removePinInput}
                  onChange={(e) => setRemovePinInput(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100"
                  required
                />
                <button
                  type="submit"
                  className="py-1.5 px-3 rounded-xl border border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 text-xs font-medium cursor-pointer"
                >
                  إلغاء القفل
                </button>
              </div>
              {removeError && (
                <p className="text-xs text-rose-500 font-medium">{removeError}</p>
              )}
            </form>
          </div>
        ) : (
          <form onSubmit={handleSetupPin} className="max-w-md space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              يمكنك تعيين رمز مرور رقمي (4 - 8 أرقام) يُطلب تلقائياً عند فتح التطبيق أو عند الضغط على زر القفل.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="password"
                  placeholder="رمز مرور جديد"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100"
                  required
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="تأكيد رمز المرور"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100"
                  required
                />
              </div>
            </div>

            {pinError && <p className="text-xs text-rose-500 font-medium">{pinError}</p>}
            {pinSuccess && <p className="text-xs text-emerald-600 font-medium">{pinSuccess}</p>}

            <button
              type="submit"
              className="py-2 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-medium cursor-pointer shadow-sm"
            >
              تفعيل القفل المحلي
            </button>
          </form>
        )}
      </div>

      {/* Browser Storage Transparency Notice */}
      <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed space-y-1">
          <p className="font-bold">حدود أمان المتصفح والتخزين المحلي:</p>
          <p className="text-amber-800 dark:text-amber-300">
            تُخزن جميع سجلاتك ومرفقاتك محلياً داخل قاعدة بيانات المتصفح (IndexedDB). قفل الواجهة برقم PIN يحمي شاشتك من الاستخدام غير المصرح به على نفس الجهاز، ولكنه لا يُغني عن أخذ <strong>نسخ احتياطية دورية</strong> من تبويب «النسخ والاستعادة»، لأن مسح بيانات الموقع أو التصفح في الوضع الخاص قد يمسح بيانات المتصفح.
          </p>
        </div>
      </div>

      {/* Dart Domain Specifications Section (For Flutter / Android / iOS) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                مواصفات وتصدير شيفرة Dart النقية (Pure Domain Engine)
              </h3>
              <p className="text-[11px] text-slate-500">
                فصل المنطق المالي وتمكينه من العمل على Android وiOS بنفس القواعد الرياضية
              </p>
            </div>
          </div>
        </div>

        {/* Flutter Porting Limits & Architectural Notice */}
        <div className="mb-4 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-xs text-blue-950 dark:text-blue-200 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-100">
            <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>حدود التصدير الحالية ومتطلبات تطبيق الهاتف المحمول:</span>
          </div>
          <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
            الشفرات البرمجية أدناه تمثل <strong>طبقة المنطق المالي النقي (Domain Layer)</strong> المكتوبة بلغة Dart (حساب الأرصدة، وقواعد الإشارات، ونماذج البيانات). هذه الشفرات جاهزة للنسخ مباشرة داخل مجلد <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded">lib/domain/</code> في أي مشروع Flutter.
          </p>
          <div className="text-[11px] text-blue-800 dark:text-blue-300">
            <strong>لإصدار تطبيق محمول متكامل (Android / iOS)، يتطلب مشروع Flutter إكمال:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5 pr-2">
              <li>واجهات المستخدم (Flutter Widgets & Screens) بدلاً من مكونات الويب.</li>
              <li>طبقة التخزين الموضعي للهاتف (مثل sqflite أو Hive بدلاً من IndexedDB).</li>
              <li>إدارة الحالة في التطبيق (Riverpod أو Bloc أو Provider).</li>
              <li>أذونات الكاميرا وتخزين الملفات للمرفقات الخاصة بنظامي Android وiOS.</li>
            </ul>
          </div>
        </div>

        {/* Dart Tabs */}
        <div className="flex items-center gap-1.5 mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveDartTab('calculator')}
            className={`py-1 px-3 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
              activeDartTab === 'calculator'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            account_balance_calculator.dart
          </button>
          <button
            type="button"
            onClick={() => setActiveDartTab('account')}
            className={`py-1 px-3 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
              activeDartTab === 'account'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            account_model.dart
          </button>
          <button
            type="button"
            onClick={() => setActiveDartTab('transaction')}
            className={`py-1 px-3 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
              activeDartTab === 'transaction'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            transaction_model.dart
          </button>
        </div>

        {/* Code View with Copy Button */}
        <div className="relative rounded-xl bg-slate-950 text-slate-200 font-mono text-xs p-4 overflow-x-auto max-h-96 border border-slate-800" dir="ltr">
          <button
            type="button"
            onClick={() => {
              const code =
                activeDartTab === 'calculator'
                  ? DART_BALANCE_CALCULATOR_SOURCE
                  : activeDartTab === 'account'
                  ? DART_ACCOUNT_MODEL_SOURCE
                  : DART_TRANSACTION_MODEL_SOURCE;
              copyDartSource(code, activeDartTab);
            }}
            className="absolute right-3 top-3 py-1 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans flex items-center gap-1 cursor-pointer transition-colors"
          >
            {copiedTab === activeDartTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>

          <pre>
            <code>
              {activeDartTab === 'calculator' && DART_BALANCE_CALCULATOR_SOURCE}
              {activeDartTab === 'account' && DART_ACCOUNT_MODEL_SOURCE}
              {activeDartTab === 'transaction' && DART_TRANSACTION_MODEL_SOURCE}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};
