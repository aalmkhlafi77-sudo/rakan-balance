import React, { useEffect, useState } from 'react';
import { ShieldCheck, Save } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { SUPPORTED_CURRENCIES } from '../domain/types.ts';

export const OwnerSettingsView: React.FC = () => {
  const { settings, updateOwnerProfile } = useApp();
  const [name, setName] = useState(settings.ownerName);
  const [currency, setCurrency] = useState(settings.currencyCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setName(settings.ownerName); setCurrency(settings.currencyCode); },
    [settings.ownerName, settings.currencyCode]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      await updateOwnerProfile(name, currency);
      setMessage('تم حفظ إعدادات المالك في قاعدة البيانات الخاصة.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر الحفظ على الخادم.');
    } finally { setBusy(false); }
  };
  return (
    <section dir="rtl" className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-7 space-y-5">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="w-5 h-5" />
        <h2 className="font-bold text-lg">إعدادات المالك الخاصة</h2>
      </div>
      <p className="text-xs leading-7 text-slate-500 dark:text-slate-300">
        تُحفظ هذه الإعدادات على خادم المالك وليس في متصفحات الزوار.
        لا يمكن تغيير عملة الحسابات بعد تسجيل أرصدة افتتاحية أو حركات مالية.
        يُدار تغيير كلمة مرور الدخول عبر إدارة الخادم الآمنة، وليس رمز PIN المحلي.
      </p>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="block text-xs font-bold">اسم المالك</span>
          <input value={name} onChange={(event) => setName(event.target.value)}
            maxLength={100} required className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-transparent p-3 text-sm" />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs font-bold">العملة الموحدة</span>
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 p-3 text-sm">
            {SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 min-h-11 px-5 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
          <Save className="w-4 h-4" /> {busy ? 'جاري الحفظ...' : 'حفظ إعدادات المالك'}
        </button>
        {message && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{message}</p>}
      </form>
    </section>
  );
};
