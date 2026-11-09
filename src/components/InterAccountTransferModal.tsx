/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Inter-Account Transfer Modal Component (N1)
 * Transfers debt from source account to destination account with live financial preview,
 * balance validations, debounced atomic saving, and support for create & edit modes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatCurrency, formatMinorAmount, tryToMinorUnits } from '../domain/money.ts';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  Calendar,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface InterAccountTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSourceAccountId?: string;
  initialTransferId?: string;
}

export const InterAccountTransferModal: React.FC<InterAccountTransferModalProps> = ({
  isOpen,
  onClose,
  initialSourceAccountId,
  initialTransferId,
}) => {
  const {
    accounts,
    transactions,
    getAccountBalance,
    createInterAccountTransfer,
    updateInterAccountTransfer,
    settings,
  } = useApp();

  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [destinationAccountId, setDestinationAccountId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active accounts list
  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => a.status === 'active');
  }, [accounts]);

  // Load existing transfer if in edit mode
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setIsSubmitting(false);

    if (initialTransferId) {
      const pair = transactions.filter((t) => t.transferId === initialTransferId);
      const source = pair.find((t) => t.transferRole === 'source');
      const dest = pair.find((t) => t.transferRole === 'destination');

      if (source && dest) {
        setSourceAccountId(source.accountId);
        setDestinationAccountId(dest.accountId);
        setAmountStr((source.amountMinor / 100).toFixed(2));
        setDate(source.date);
        setDescription(source.description);
        setNotes(source.notes || '');
        return;
      }
    }

    // Default create mode
    const defaultSource =
      initialSourceAccountId ||
      activeAccounts.find((a) => getAccountBalance(a.id) > 0)?.id ||
      activeAccounts[0]?.id ||
      '';

    const defaultDest = activeAccounts.find((a) => a.id !== defaultSource)?.id || '';

    setSourceAccountId(defaultSource);
    setDestinationAccountId(defaultDest);
    setAmountStr('');
    setDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setNotes('');
  }, [isOpen, initialTransferId, initialSourceAccountId, activeAccounts]);

  // Selected accounts objects
  const sourceAccount = useMemo(() => {
    return accounts.find((a) => a.id === sourceAccountId);
  }, [accounts, sourceAccountId]);

  const destAccount = useMemo(() => {
    return accounts.find((a) => a.id === destinationAccountId);
  }, [accounts, destinationAccountId]);

  // Available source balance calculation (accounting for edit mode)
  const sourceAvailableBalanceMinor = useMemo(() => {
    if (!sourceAccount) return 0;
    const baseBalance = getAccountBalance(sourceAccount.id);

    if (initialTransferId) {
      // In edit mode, restore the previous transfer amount back to the source balance for calculation
      const prevSourceTx = transactions.find(
        (t) => t.transferId === initialTransferId && t.transferRole === 'source'
      );
      if (prevSourceTx && prevSourceTx.accountId === sourceAccount.id) {
        return baseBalance + prevSourceTx.amountMinor;
      }
    }

    return baseBalance;
  }, [sourceAccount, initialTransferId, transactions, getAccountBalance]);

  // Destination base balance
  const destBaseBalanceMinor = useMemo(() => {
    if (!destAccount) return 0;
    const baseBalance = getAccountBalance(destAccount.id);

    if (initialTransferId) {
      // In edit mode, remove old transfer amount from dest
      const prevDestTx = transactions.find(
        (t) => t.transferId === initialTransferId && t.transferRole === 'destination'
      );
      if (prevDestTx && prevDestTx.accountId === destAccount.id) {
        return baseBalance - prevDestTx.amountMinor;
      }
    }

    return baseBalance;
  }, [destAccount, initialTransferId, transactions, getAccountBalance]);

  // Parsed amount in minor units
  const parsedAmountResult = useMemo(() => {
    if (!amountStr.trim()) return null;
    return tryToMinorUnits(amountStr);
  }, [amountStr]);

  const amountMinor = parsedAmountResult?.success ? parsedAmountResult.minor : 0;

  // New simulated balances
  const sourceNewBalanceMinor = sourceAvailableBalanceMinor - amountMinor;
  const destNewBalanceMinor = destBaseBalanceMinor + amountMinor;

  // Auto-generate description placeholder or default
  useEffect(() => {
    if (!initialTransferId && !description && sourceAccount && destAccount) {
      setDescription(`نقل مديونية من ${sourceAccount.name} إلى ${destAccount.name}`);
    }
  }, [sourceAccount, destAccount, initialTransferId, description]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMsg('');

    // Pre-flight checks
    if (!sourceAccountId || !destinationAccountId) {
      setErrorMsg('يرجى اختيار الحسابين معاً.');
      return;
    }

    if (sourceAccountId === destinationAccountId) {
      setErrorMsg('لا يمكن إجراء حركة بينية للحساب نفسه؛ يجب اختيار حسابين مختلفين.');
      return;
    }

    if (!parsedAmountResult || !parsedAmountResult.success || amountMinor <= 0) {
      setErrorMsg('يرجى إدخال مبلغ صحيح وموجب بالهللات.');
      return;
    }

    if (sourceAvailableBalanceMinor <= 0) {
      setErrorMsg(
        `الحساب المحول منه "${sourceAccount?.name}" ليس عليه مديونية مستحقة لك حالياً لنقلها.`
      );
      return;
    }

    if (amountMinor > sourceAvailableBalanceMinor) {
      setErrorMsg(
        `مبلغ النقل (${formatMinorAmount(amountMinor)} ر.س) يتجاوز الرصيد المستحق على الحساب المحول منه (${formatMinorAmount(sourceAvailableBalanceMinor)} ر.س).`
      );
      return;
    }

    const finalDesc =
      description.trim() ||
      `نقل مديونية من ${sourceAccount?.name || ''} إلى ${destAccount?.name || ''}`;

    setIsSubmitting(true);
    try {
      if (initialTransferId) {
        await updateInterAccountTransfer(initialTransferId, {
          sourceAccountId,
          destinationAccountId,
          amountMinor,
          date,
          description: finalDesc,
          notes: notes.trim() || undefined,
        });
      } else {
        await createInterAccountTransfer({
          sourceAccountId,
          destinationAccountId,
          amountMinor,
          date,
          description: finalDesc,
          notes: notes.trim() || undefined,
        });
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ الحركة البينية.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {initialTransferId ? 'تعديل الحركة البينية' : 'تسجيل حركة بينية (نقل مديونية)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                نقل التزام مالي بين طرفين مع المحافظة التامة على توازن المركز المالي
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Account Selectors Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Source Account */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الطرف المحول منه (خفض دينه): <span className="text-rose-500">*</span>
              </label>
              <select
                value={sourceAccountId}
                onChange={(e) => {
                  setSourceAccountId(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              >
                <option value="">-- اختر الحساب المحول منه --</option>
                {activeAccounts.map((a) => {
                  const bal = getAccountBalance(a.id);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name} ({bal > 0 ? `دينه لك: ${formatMinorAmount(bal)} ر.س` : 'ليس عليه دين'})
                    </option>
                  );
                })}
              </select>
              {sourceAccount && (
                <div className="mt-1 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                  <span>الرصيد المتاح للنقل:</span>
                  <span
                    className={`font-bold ${
                      sourceAvailableBalanceMinor > 0 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {formatCurrency(sourceAvailableBalanceMinor, { showSign: true })}
                  </span>
                </div>
              )}
            </div>

            {/* Destination Account */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                الطرف المحول إليه (زيادة دينه): <span className="text-rose-500">*</span>
              </label>
              <select
                value={destinationAccountId}
                onChange={(e) => {
                  setDestinationAccountId(e.target.value);
                  setErrorMsg('');
                }}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
              >
                <option value="">-- اختر الحساب المحول إليه --</option>
                {activeAccounts
                  .filter((a) => a.id !== sourceAccountId)
                  .map((a) => {
                    const bal = getAccountBalance(a.id);
                    return (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(bal, { showSign: true })})
                      </option>
                    );
                  })}
              </select>
              {destAccount && (
                <div className="mt-1 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                  <span>رصيده الحالي:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {formatCurrency(destBaseBalanceMinor, { showSign: true })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Amount & Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                المبلغ المراد نقله ({settings.currencySymbol}): <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="مثال: 500.00"
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value);
                    setErrorMsg('');
                  }}
                  className="w-full h-10 px-3 pl-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-sans">
                  {settings.currencySymbol}
                </span>
              </div>
              {parsedAmountResult?.success && (
                <div className="mt-1 text-[11px] text-slate-400 font-mono">
                  = {parsedAmountResult.minor.toLocaleString()} هللة
                </div>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                تاريخ الحركة: <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-3 pl-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              البيان والوصف: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: حوالة دين / تفويض سداد"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              ملاحظات إضافية (اختياري):
            </label>
            <input
              type="text"
              placeholder="أي تفاصيل خاصة بالحوالة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          {/* Live Financial Impact Preview Box */}
          {sourceAccount && destAccount && amountMinor > 0 && (
            <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/50 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-300">
                <Layers className="w-4 h-4" />
                <span>معاينة الأثر المالي للحركة البينية:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Source Account Impact */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 font-mono">
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-sans mb-1 flex items-center justify-between">
                    <span className="truncate">{sourceAccount.name}</span>
                    <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/80 px-1.5 py-0.5 rounded">
                      محول منه
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>الرصيد السابق:</span>
                    <span>{formatCurrency(sourceAvailableBalanceMinor)}</span>
                  </div>
                  <div className="text-[11px] text-rose-600 dark:text-rose-400 font-bold flex justify-between">
                    <span>خصم المديونية:</span>
                    <span>-{formatMinorAmount(amountMinor)} ر.س</span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-900 dark:text-slate-100 flex justify-between">
                    <span>الرصيد الجديد:</span>
                    <span>{formatCurrency(sourceNewBalanceMinor, { showSign: true })}</span>
                  </div>
                </div>

                {/* Dest Account Impact */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 font-mono">
                  <div className="font-bold text-slate-900 dark:text-slate-100 font-sans mb-1 flex items-center justify-between">
                    <span className="truncate">{destAccount.name}</span>
                    <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-950/80 px-1.5 py-0.5 rounded">
                      محول إليه
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>الرصيد السابق:</span>
                    <span>{formatCurrency(destBaseBalanceMinor)}</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex justify-between">
                    <span>إضافة المديونية:</span>
                    <span>+{formatMinorAmount(amountMinor)} ر.س</span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-900 dark:text-slate-100 flex justify-between">
                    <span>الرصيد الجديد:</span>
                    <span>{formatCurrency(destNewBalanceMinor, { showSign: true })}</span>
                  </div>
                </div>
              </div>

              {/* Net Balance Check */}
              <div className="flex items-center justify-between text-[11px] text-purple-800 dark:text-purple-300 font-medium pt-1 border-t border-purple-200/50 dark:border-purple-900/30">
                <span>أثر الحركة على إجمالي رصيد النظام:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  0.00 ر.س (توازن تام)
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting || amountMinor <= 0 || sourceAccountId === destinationAccountId}
              data-ui-effect="synthwave-laser-transfer-confirm"
              className="rakan-laser-button py-2.5 px-6 rounded-xl disabled:opacity-50 font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <span>جاري الحفظ الآمن...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{initialTransferId ? 'تحديث الحركة البينية' : 'تأكيد وحفظ الحركة البينية'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
