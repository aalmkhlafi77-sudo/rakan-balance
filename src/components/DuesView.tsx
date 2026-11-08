/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Simplified Dues & Reminders View (WEB-F4)
 * Tracking dues, partial/full settlements, overdue days, and quick WhatsApp/Clipboard reminders.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { dueDisplayStatus, dueRemaining } from '../domain/dues.ts';
import { formatMinorAmount, tryToMinorUnits } from '../domain/money.ts';
import { calculateOverdueDays, buildReminderMessage } from '../tests/web_dues_spec.ts';
import type { EntryType } from '../domain/types.ts';
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Share2,
  Copy,
  Plus,
  Trash2,
  DollarSign,
  MessageSquare,
  Send,
  X,
  Check,
} from 'lucide-react';

const localToday = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

export const DuesView: React.FC = () => {
  const {
    accounts,
    dues,
    reminders,
    createDue,
    settleDue,
    deleteUnpaidDue,
    createReminder,
    completeReminder,
    activeScope,
    getAccountBalance,
    settings,
  } = useApp();

  const [accountId, setAccountId] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('owedByAccount');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(localToday);
  const [notes, setNotes] = useState('');

  // Settlement inline state
  const [payingDueId, setPayingDueId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday);

  // Reminder inline state / modal
  const [activeReminderDueId, setActiveReminderDueId] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [saveNoteDate, setSaveNoteDate] = useState(localToday);
  const [showManualNoteForm, setShowManualNoteForm] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);

  const [filter, setFilter] = useState<'all' | 'open' | 'overdue' | 'settled' | 'today'>('all');
  const today = localToday();
  const activeAccounts = accounts.filter((a) => a.status === 'active');

  const ordered = useMemo(() => [...dues].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [dues]);

  const visibleDues = useMemo(() => {
    return ordered.filter((d) => {
      const state = dueDisplayStatus(d, today);
      if (filter === 'all') return true;
      if (filter === 'open') return state !== 'settled';
      return state === filter;
    });
  }, [ordered, filter, today]);

  const openCount = dues.filter((d) => dueRemaining(d) > 0).length;
  const overdueCount = dues.filter((d) => dueDisplayStatus(d, today) === 'overdue').length;
  const totalRemainingMinor = dues.reduce((sum, d) => sum + dueRemaining(d), 0);

  const run = async (action: () => Promise<void>, successMessage: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'تعذر إكمال العملية.');
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2500);
      },
      () => {
        setError('تعذر نسخ النص تلقائياً.');
      }
    );
  };

  return (
    <section className="space-y-6" dir="rtl">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            متابعة الاستحقاقات والتذكيرات
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            عرض مبسط للآجال والدفعات الجزئية وإرسال تذكيرات سريعة دون المساس بالمحرك المالي
          </p>
        </div>
        {activeScope === 'demo' && (
          <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
            بيانات محاكاة تجريبية
          </span>
        )}
      </header>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-xs text-slate-500 mb-1">الاستحقاقات القائمة (المفتوحة)</div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">{openCount}</div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-xs text-slate-500 mb-1">الاستحقاقات المتأخرة</div>
          <div className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400">{overdueCount}</div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-xs text-slate-500 mb-1">إجمالي المتبقي للمتابعة</div>
          <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {formatMinorAmount(totalRemainingMinor)} <span className="text-xs font-sans">{settings.currencySymbol}</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div role="status" className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{message}</span>
        </div>
      )}

      {/* Create Due Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = tryToMinorUnits(amount);
          if (!parsed.success || parsed.minor <= 0) {
            setError(parsed.error || 'أدخل مبلغاً صحيحاً أكبر من الصفر.');
            return;
          }
          if (!accountId) {
            setError('اختر الحساب المرتبط بالاستحقاق.');
            return;
          }
          void run(async () => {
            await createDue({ accountId, entryType, dueDate, amountMinor: parsed.minor, notes: notes.trim() || undefined });
            setAmount('');
            setNotes('');
            setAccountId('');
          }, 'تم تسجيل الاستحقاق دون إضافة حركة مالية على الأرصدة.');
        }}
        className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <Plus className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">إضافة موعد استحقاق جديد</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">الحساب / الطرف:</label>
            <select
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              <option value="">اختر الحساب...</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatMinorAmount(getAccountBalance(a.id))} {settings.currencySymbol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">اتجاه الاستحقاق:</label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as EntryType)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              <option value="owedByAccount">مستحق لك (+)</option>
              <option value="owedToAccount">مستحق عليك (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">المبلغ ({settings.currencySymbol}):</label>
            <input
              required
              inputMode="decimal"
              placeholder="مثال: 500.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاريخ الاستحقاق:</label>
            <input
              required
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">بيان وملاحظة المتابعة (اختياري):</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: قيمة بضاعة آافقة، دفعة مؤجلة..."
            className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
          />
        </div>

        <button
          disabled={busy}
          type="submit"
          className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-all shadow-sm shadow-emerald-600/30"
        >
          حفظ موعد الاستحقاق
        </button>
      </form>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ['all', 'الكل'],
          ['open', 'المفتوحة'],
          ['today', 'المستحقة اليوم'],
          ['overdue', 'المتأخرة'],
          ['settled', 'المسددة بالكامل'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key as any)}
            className={`px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer font-medium ${
              filter === key
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100 font-bold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Dues Cards List */}
      <div className="space-y-4">
        {visibleDues.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            لا توجد استحقاقات مطابقة للفلاتر المحددة.
          </div>
        ) : (
          visibleDues.map((due) => {
            const account = accounts.find((a) => a.id === due.accountId);
            const status = dueDisplayStatus(due, today);
            const remMinor = dueRemaining(due);
            const overdueDays = calculateOverdueDays(due.dueDate, today);
            const dueReminders = reminders.filter((r) => r.dueItemId === due.id);
            const isOwedBy = due.entryType === 'owedByAccount';

            // Status Badge Formatting
            const isPartial = due.settledAmountMinor > 0;
            let statusLabel = 'قادم';
            let badgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

            if (status === 'settled') {
              statusLabel = 'مسدد بالكامل';
              badgeStyle = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
            } else if (status === 'overdue') {
              statusLabel = isPartial
                ? `متأخر (${overdueDays} يوم - مسدد جزئياً)`
                : `متأخر (${overdueDays} يوم)`;
              badgeStyle = 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-bold';
            } else if (status === 'today') {
              statusLabel = isPartial ? 'مستحق اليوم (مسدد جزئياً)' : 'مستحق اليوم';
              badgeStyle = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 font-bold';
            } else if (status === 'partially_settled') {
              statusLabel = 'مسدد جزئياً';
              badgeStyle = 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800';
            }

            const reminderText = buildReminderMessage(
              account?.name || 'العميل',
              due.entryType,
              formatMinorAmount(remMinor),
              due.dueDate,
              settings.currencySymbol
            );

            return (
              <article
                key={due.id}
                className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                        isOwedBy
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {isOwedBy ? 'مستحق لك (+)' : 'مستحق عليك (-)'}
                    </span>
                    <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                      {account?.name || 'حساب غير معروف'}
                    </h4>
                  </div>

                  <span className={`text-xs px-3 py-1 rounded-xl border ${badgeStyle}`}>
                    {statusLabel}
                  </span>
                </div>

                {/* Figures Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 font-mono">
                  <div>
                    <span className="text-slate-400 block text-[11px] font-sans">المبلغ الأصلي</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatMinorAmount(due.originalAmountMinor)} {settings.currencySymbol}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-sans">المدفوع</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatMinorAmount(due.settledAmountMinor)} {settings.currencySymbol}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-sans">المتبقي</span>
                    <span className="font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                      {formatMinorAmount(remMinor)} {settings.currencySymbol}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px] font-sans">تاريخ الاستحقاق</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {due.dueDate}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                {due.notes && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-800/20 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-500 font-sans">ملاحظة المتابعة: </span>
                    <span>{due.notes}</span>
                  </div>
                )}

                {/* Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {remMinor > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPayingDueId(payingDueId === due.id ? null : due.id);
                          setActiveReminderDueId(null);
                          setPaymentAmount('');
                          setError('');
                        }}
                        className="py-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>تسجيل سداد جزئي / كامل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveReminderDueId(activeReminderDueId === due.id ? null : due.id);
                          setPayingDueId(null);
                          setError('');
                        }}
                        className="py-1.5 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>تذكير</span>
                      </button>
                    </>
                  )}

                  {due.settledAmountMinor === 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm('هل تريد حذف هذا الاستحقاق غير المسدد؟ لن تتأثر أي حركة مالية أو رصيد.')) return;
                        void run(() => deleteUnpaidDue(due.id), 'تم حذف الاستحقاق غير المسدد.');
                      }}
                      className="py-1.5 px-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer mr-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الاستحقاق</span>
                    </button>
                  )}
                </div>

                {/* Inline Payment Form */}
                {payingDueId === due.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const p = tryToMinorUnits(paymentAmount);
                      if (!p.success || p.minor <= 0) {
                        setError(p.error || 'المبلغ غير صالح');
                        return;
                      }
                      if (p.minor > remMinor) {
                        setError('مبلغ السداد لا يمكن أن يتجاوز المبلغ المتبقي.');
                        return;
                      }
                      void run(async () => {
                        await settleDue(due.id, p.minor, paymentDate);
                        setPayingDueId(null);
                        setPaymentAmount('');
                      }, 'تم تسجيل حركة سداد واحدة وربطها بالاستحقاق بنجاح.');
                    }}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3"
                  >
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      <span>تسجيل سداد على استحقاق {account?.name} (المتبقي: {formatMinorAmount(remMinor)} {settings.currencySymbol})</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold mb-1">مبلغ السداد ({settings.currencySymbol}):</label>
                        <input
                          required
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          inputMode="decimal"
                          placeholder={`أقصى مبلغ: ${formatMinorAmount(remMinor)}`}
                          className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold mb-1">تاريخ السداد:</label>
                        <input
                          required
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPayingDueId(null)}
                        className="py-1.5 px-3 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        تأكيد السداد والربط بالحركة
                      </button>
                    </div>
                  </form>
                )}

                {/* Inline Reminder Drawer / Action Panel */}
                {activeReminderDueId === due.id && (
                  <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <h5 className="font-bold text-xs text-slate-100">إرسال / نسخ تذكير عربي مختصر</h5>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveReminderDueId(null)}
                        className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Formatted Text Box */}
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-sans leading-relaxed text-slate-200 select-all">
                      {reminderText}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(reminderText)}
                        className="py-1.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                      >
                        {copiedSuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSuccess ? 'تم النسخ!' : 'نسخ نص التذكير'}</span>
                      </button>

                      <a
                        href={`https://wa.me/${(account?.phone || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(reminderText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-3.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>مشاركة عبر واتساب</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setShowManualNoteForm(!showManualNoteForm)}
                        className="py-1.5 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer mr-auto"
                      >
                        حفظ ملاحظة تذكير تاريخية
                      </button>
                    </div>

                    {/* Optional Manual Reminder Note Form */}
                    {showManualNoteForm && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await createReminder(due.id, saveNoteDate, reminderText);
                            setShowManualNoteForm(false);
                          }, 'تم حفظ تذكير للمتابعة اليدوية.');
                        }}
                        className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs"
                      >
                        <input
                          type="date"
                          value={saveNoteDate}
                          onChange={(e) => setSaveNoteDate(e.target.value)}
                          className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="sm:col-span-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                        >
                          تأكيد حفظ التذكير
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Historical Manual Reminders list */}
                {dueReminders.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                    <span className="font-semibold text-slate-500 text-[11px] block">سجل التذكيرات اليدوية:</span>
                    {dueReminders.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        <span>
                          <span className="font-mono text-slate-500 font-bold ml-1">{r.remindAt}:</span>
                          <span>{r.templateText}</span>
                          {r.isCompleted && <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-1"> (مكتمل)</span>}
                        </span>
                        {!r.isCompleted && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => completeReminder(r.id), 'تم إتمام التذكير.')}
                            className="py-1 px-2 rounded bg-slate-200 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white text-[11px] cursor-pointer transition-colors"
                          >
                            تمييز كمكتمل
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
