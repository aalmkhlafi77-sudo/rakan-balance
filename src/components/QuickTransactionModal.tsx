/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Quick Transaction Entry Modal
 * Handles Adding or Editing financial movements (عليه / له) with attachments
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { AttachmentModel, EntryType, TransactionModel } from '../domain/types.ts';
import { formatCurrency, fromMinorUnits, toMinorUnits } from '../domain/money.ts';
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Paperclip,
  Trash2,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface QuickTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction?: TransactionModel | null;
  defaultAccountId?: string;
  defaultEntryType?: EntryType;
}

export const QuickTransactionModal: React.FC<QuickTransactionModalProps> = ({
  isOpen,
  onClose,
  editingTransaction,
  defaultAccountId,
  defaultEntryType = 'owedByAccount',
}) => {
  const { accounts, addTransaction, updateTransaction, getAccountBalance, settings } = useApp();

  const [accountId, setAccountId] = useState<string>('');
  const [entryType, setEntryType] = useState<EntryType>(defaultEntryType);
  const [amountInput, setAmountInput] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [attachments, setAttachments] = useState<AttachmentModel[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when modal opens
  useEffect(() => {
    if (editingTransaction) {
      setAccountId(editingTransaction.accountId);
      setEntryType(editingTransaction.entryType);
      setAmountInput(fromMinorUnits(editingTransaction.amountMinor).toFixed(2));
      setDate(editingTransaction.date);
      setDescription(editingTransaction.description);
      setNotes(editingTransaction.notes || '');
      setAttachments([]);
      setRemovedAttachmentIds([]);
    } else {
      setAccountId(defaultAccountId || (accounts.find((a) => a.status === 'active')?.id || ''));
      setEntryType(defaultEntryType);
      setAmountInput('');
      setDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setNotes('');
      setAttachments([]);
      setRemovedAttachmentIds([]);
    }
    setError('');
  }, [isOpen, editingTransaction, defaultAccountId, defaultEntryType, accounts]);

  if (!isOpen) return null;

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const currentAccountBalance = selectedAccount ? getAccountBalance(selectedAccount.id) : 0;

  // Handle local file uploads
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        setError(`حجم الملف "${file.name}" يتجاوز الحد المسموح به (5 ميجابايت).`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newAtt: AttachmentModel = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          transactionId: editingTransaction ? editingTransaction.id : '',
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
          createdAt: new Date().toISOString(),
        };
        setAttachments((prev) => [...prev, newAtt]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
    if (editingTransaction && editingTransaction.attachmentIds.includes(attId)) {
      setRemovedAttachmentIds((prev) => [...prev, attId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!accountId) {
      setError('يرجى اختيار الحساب المرتبط بالحركة.');
      return;
    }

    const minor = toMinorUnits(amountInput);
    if (minor <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من الصفر.');
      return;
    }

    if (!description.trim()) {
      setError('يرجى كتابة وصف موجز للحركة.');
      return;
    }

    if (!date) {
      setError('يرجى تحديد تاريخ الحركة.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingTransaction) {
        await updateTransaction(
          {
            ...editingTransaction,
            accountId,
            entryType,
            amountMinor: minor,
            date,
            description: description.trim(),
            notes: notes.trim() || undefined,
          },
          attachments.filter((a) => !editingTransaction.attachmentIds.includes(a.id)),
          removedAttachmentIds
        );
      } else {
        await addTransaction(
          {
            accountId,
            entryType,
            amountMinor: minor,
            date,
            description: description.trim(),
            notes: notes.trim() || undefined,
            attachmentIds: [],
          },
          attachments
        );
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ الحركة المالية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                entryType === 'owedByAccount'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
              }`}
            >
              {entryType === 'owedByAccount' ? (
                <ArrowUpRight className="w-5 h-5" />
              ) : (
                <ArrowDownLeft className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingTransaction ? 'تعديل حركة مالية' : 'تسجيل حركة مالية جديدة'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {entryType === 'owedByAccount'
                  ? '«عليه» — تزيد رصيد المستحق لك'
                  : '«له» — تنقص رصيد المستحق (التزام أو دفعة)'}
              </p>
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

        {/* Error Alert */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Movement Type Toggle Buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              نوع الحركة المالية (من منظورك كمالك):
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => setEntryType('owedByAccount')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  entryType === 'owedByAccount'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>عليه (+ لك)</span>
              </button>

              <button
                type="button"
                onClick={() => setEntryType('owedToAccount')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  entryType === 'owedToAccount'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>له (- عليك / سداد)</span>
              </button>
            </div>
          </div>

          {/* Account Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              الحساب المرتبط:
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
              required
            >
              <option value="" disabled>
                اختر الحساب...
              </option>
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.parentId ? '(حساب فرعي)' : ''}
                </option>
              ))}
            </select>

            {selectedAccount && (
              <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
                <span>الرصيد الحالي للحساب:</span>
                <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                  {formatCurrency(currentAccountBalance, { showSign: true })}
                </span>
              </div>
            )}
          </div>

          {/* Amount & Date in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                المبلغ بالعملة المحلية ({settings.currencySymbol}):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full h-10 px-3 pl-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                  required
                />
                <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-400">
                  {settings.currencyCode}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                تاريخ الحركة:
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-10 px-3 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
                  required
                />
                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              وصف الحركة (بيان المعاملة):
            </label>
            <input
              type="text"
              placeholder="مثال: قيمة بضاعة، دفعة نقدية، تحويل بنكي..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ملاحظات إضافية (اختياري):
            </label>
            <textarea
              rows={2}
              placeholder="أي تفاصيل أو مرجع إضافي..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {/* Attachments Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                المرفقات والإثباتات (صور أو مستندات):
              </label>
              <label className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer">
                <Paperclip className="w-3.5 h-3.5" />
                <span>إرفاق ملف</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                        {att.originalName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(att.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
            >
              <span>{editingTransaction ? 'حفظ التعديلات' : 'تسجيل الحركة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
