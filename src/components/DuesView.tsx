import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { dueDisplayStatus, dueRemaining } from '../domain/dues.ts';
import { formatMinorAmount, tryToMinorUnits } from '../domain/money.ts';
import type { EntryType } from '../domain/types.ts';

const localToday = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const statusLabels = { pending: 'قادم', partially_settled: 'مسدد جزئيًا', settled: 'مسدد', overdue: 'متأخر' } as const;

export const DuesView: React.FC = () => {
  const { accounts, dues, reminders, createDue, settleDue, deleteUnpaidDue, createReminder, completeReminder, activeScope, getAccountBalance } = useApp();
  const [accountId, setAccountId] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('owedByAccount');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(localToday);
  const [notes, setNotes] = useState('');
  const [payingDue, setPayingDue] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday);
  const [remindingDue, setRemindingDue] = useState<string | null>(null);
  const [remindDate, setRemindDate] = useState(localToday);
  const [remindText, setRemindText] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'settled'>('all');
  const today = localToday();
  const activeAccounts = accounts.filter(a => a.status === 'active');
  const ordered = useMemo(() => [...dues].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [dues]);
  const visibleDues = ordered.filter(d => {
    const state = dueDisplayStatus(d, today);
    return filter === 'all' || (filter === 'open' && state !== 'settled') || state === filter;
  });
  const openCount = dues.filter(d => dueRemaining(d) > 0).length;
  const overdueCount = dues.filter(d => dueDisplayStatus(d, today) === 'overdue').length;
  const remaining = dues.reduce((sum, d) => sum + dueRemaining(d), 0);

  const run = async (action: () => Promise<void>, success: string) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر إكمال العملية.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-5" dir="rtl">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">الاستحقاقات والسداد والتذكيرات</h2>
        <p className="text-sm text-slate-500">متابعة مواعيد الاستحقاق والدفعات الجزئية. إنشاء الاستحقاق أو التذكير لا يغيّر رصيد الحساب.</p>
        {activeScope === 'demo' && <p className="text-amber-600 text-xs font-bold">مساحة تجريبية معزولة عن البيانات الحقيقية</p>}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900"><p className="text-xs text-slate-500">الاستحقاقات المفتوحة</p><p className="text-2xl font-bold">{openCount}</p></div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900"><p className="text-xs text-slate-500">الاستحقاقات المتأخرة</p><p className="text-2xl font-bold text-rose-600">{overdueCount}</p></div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900"><p className="text-xs text-slate-500">إجمالي المتبقي للمتابعة</p><p className="text-xl font-bold">{formatMinorAmount(remaining)} ر.س</p></div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

      <form onSubmit={e => {
        e.preventDefault();
        const parsed = tryToMinorUnits(amount);
        if (!parsed.success || parsed.minor <= 0) { setError(parsed.error || 'أدخل مبلغًا موجبًا.'); return; }
        void run(async () => {
          await createDue({ accountId, entryType, dueDate, amountMinor: parsed.minor, notes });
          setAmount(''); setNotes(''); setAccountId('');
        }, 'تم تسجيل الاستحقاق دون إضافة حركة مالية.');
      }} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h3 className="font-bold text-sm">إضافة استحقاق للرصيد القائم</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-semibold space-y-1">الحساب
            <select required value={accountId} onChange={e => setAccountId(e.target.value)} className="block w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value="">اختر الحساب</option>
              {activeAccounts.map(a => <option value={a.id} key={a.id}>{a.name} ({formatMinorAmount(getAccountBalance(a.id))} ر.س)</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold space-y-1">نوع الاستحقاق
            <select value={entryType} onChange={e => setEntryType(e.target.value as EntryType)} className="block w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value="owedByAccount">مستحق لك</option>
              <option value="owedToAccount">مستحق عليك</option>
            </select>
          </label>
          <label className="text-xs font-semibold space-y-1">المبلغ (ريال)
            <input required inputMode="decimal" placeholder="مثال: 150.25" value={amount} onChange={e => setAmount(e.target.value)} className="block w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"/>
          </label>
          <label className="text-xs font-semibold space-y-1">تاريخ الاستحقاق
            <input required type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="block w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"/>
          </label>
        </div>
        <label className="text-xs font-semibold space-y-1 block">ملاحظة متابعة (اختيارية)
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="تفاصيل الاستحقاق" className="block w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"/>
        </label>
        <button disabled={busy} type="submit" className="rounded-lg px-4 py-2 bg-emerald-600 text-white disabled:opacity-50">حفظ الاستحقاق</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {([['all','الكل'],['open','المفتوحة'],['overdue','المتأخرة'],['settled','المسددة']] as const).map(([key,label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs border ${filter === key ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-300 dark:border-slate-700'}`}>{label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {visibleDues.length === 0 && <p className="text-sm text-slate-500">لا توجد استحقاقات مطابقة.</p>}
        {visibleDues.map(due => {
          const account = accounts.find(a => a.id === due.accountId);
          const status = dueDisplayStatus(due, today);
          const dueReminders = reminders.filter(r => r.dueItemId === due.id);
          return <article key={due.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-wrap gap-3 justify-between">
              <div><p className="font-bold">{account?.name || 'حساب غير معروف'}</p><p className="text-xs text-slate-500">موعد الاستحقاق: {due.dueDate} · {due.entryType === 'owedByAccount' ? 'لك' : 'عليك'}</p></div>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${status === 'overdue' ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' : 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'}`}>{statusLabels[status]}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <p>الأصل: <strong>{formatMinorAmount(due.originalAmountMinor)} ر.س</strong></p>
              <p>المسدد: <strong>{formatMinorAmount(due.settledAmountMinor)} ر.س</strong></p>
              <p>المتبقي: <strong>{formatMinorAmount(dueRemaining(due))} ر.س</strong></p>
            </div>
            {due.notes && <p className="text-xs text-slate-500">{due.notes}</p>}
            {dueRemaining(due) > 0 && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => {setPayingDue(payingDue === due.id ? null : due.id); setRemindingDue(null); setPaymentAmount(''); setError('');}} className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600">تسجيل سداد جزئي / كامل</button>
              <button type="button" onClick={() => {setRemindingDue(remindingDue === due.id ? null : due.id); setPayingDue(null); setRemindText(`تذكير: يوجد استحقاق بتاريخ ${due.dueDate} بمبلغ متبقٍ ${formatMinorAmount(dueRemaining(due))} ر.س.`); setError('');}} className="px-3 py-2 rounded-lg text-xs border border-slate-300 dark:border-slate-700">تذكير يدوي</button>
              {due.settledAmountMinor === 0 && <button type="button" disabled={busy} onClick={() => {
                if (!window.confirm('هل تريد حذف الاستحقاق غير المسدد وتذكيراته دون أي تغيير للحركات المالية؟')) return;
                void run(() => deleteUnpaidDue(due.id), 'تم حذف الاستحقاق غير المسدد وتذكيراته.');
              }} className="px-3 py-2 rounded-lg text-xs border border-rose-300 text-rose-700 dark:text-rose-300 disabled:opacity-50">حذف الاستحقاق</button>}
            </div>}
            {payingDue === due.id && <form onSubmit={e => { e.preventDefault(); const p = tryToMinorUnits(paymentAmount); if (!p.success || p.minor <= 0) {setError(p.error || 'المبلغ غير صالح');return;} void run(async () => {await settleDue(due.id, p.minor, paymentDate); setPayingDue(null); setPaymentAmount('');}, 'تم تسجيل حركة سداد واحدة وربطها بالاستحقاق.');}} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg p-3 bg-slate-50 dark:bg-slate-800">
              <label className="text-xs">مبلغ السداد<input required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} inputMode="decimal" className="block w-full mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2"/></label>
              <label className="text-xs">تاريخ السداد<input required type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="block w-full mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2"/></label>
              <button type="submit" disabled={busy} className="self-end rounded-lg p-2 bg-emerald-600 text-white disabled:opacity-50">تأكيد السداد</button>
            </form>}
            {remindingDue === due.id && <form onSubmit={e => {e.preventDefault();void run(async () => {await createReminder(due.id, remindDate, remindText);setRemindingDue(null);}, 'تم حفظ التذكير اليدوي.');}} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg p-3 bg-slate-50 dark:bg-slate-800">
              <label className="text-xs">تاريخ التذكير<input required type="date" value={remindDate} onChange={e => setRemindDate(e.target.value)} className="block w-full mt-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"/></label>
              <label className="text-xs sm:col-span-2">نص الرسالة<input required value={remindText} onChange={e => setRemindText(e.target.value)} className="block w-full mt-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"/></label>
              <button type="submit" disabled={busy} className="sm:col-span-3 rounded-lg p-2 bg-slate-700 text-white disabled:opacity-50">حفظ التذكير للمراجعة اليدوية</button>
            </form>}
            {dueReminders.length > 0 && <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-2">
              <h4 className="font-semibold text-xs">التذكيرات اليدوية</h4>
              {dueReminders.map(r => <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <span>{r.remindAt}: {r.templateText} {r.isCompleted ? '— مكتمل' : ''}</span>
                {!r.isCompleted && <button type="button" disabled={busy} onClick={() => void run(() => completeReminder(r.id), 'تم إتمام التذكير.')} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1">تمييز كمكتمل</button>}
              </div>)}
            </div>}
          </article>;
        })}
      </div>
    </section>
  );
};
