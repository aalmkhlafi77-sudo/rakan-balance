/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Transactions & Movements Ledger
 * Tabular grid with filters, search, attachment preview, and editing
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { TransactionModel, AttachmentModel } from '../domain/types.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
import {
  ReceiptText,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Paperclip,
  Download,
  X,
  FileSpreadsheet,
  ArrowLeftRight,
} from 'lucide-react';

interface TransactionsViewProps {
  onOpenQuickTx: (accountId?: string) => void;
  onEditTransaction: (tx: TransactionModel) => void;
  onOpenStatementForAccount: (accountId: string) => void;
  onOpenInterAccountTransfer?: () => void;
  onEditInterAccountTransfer?: (transferId: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  onOpenQuickTx,
  onEditTransaction,
  onOpenStatementForAccount,
  onOpenInterAccountTransfer,
  onEditInterAccountTransfer,
}) => {
  const {
    transactions,
    accounts,
    attachments,
    settings,
    deleteTransaction,
    deleteInterAccountTransfer,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'owedByAccount' | 'owedToAccount'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Delete confirmations
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [deletingTransferId, setDeletingTransferId] = useState<string | null>(null);

  // Attachment Preview Modal
  const [previewAttachmentsList, setPreviewAttachmentsList] = useState<AttachmentModel[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Filtered & stably sorted transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedAccountId !== 'all' && tx.accountId !== selectedAccountId) return false;
      if (directionFilter !== 'all' && tx.entryType !== directionFilter) return false;
      if (fromDate && tx.date < fromDate) return false;
      if (toDate && tx.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const acc = accounts.find((a) => a.id === tx.accountId);
        const matchesDesc = tx.description.toLowerCase().includes(q);
        const matchesAccount = acc?.name.toLowerCase().includes(q);
        const matchesNotes = tx.notes?.toLowerCase().includes(q);
        if (!matchesDesc && !matchesAccount && !matchesNotes) return false;
      }

      return true;
    }).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [transactions, accounts, selectedAccountId, directionFilter, fromDate, toDate, searchQuery]);

  // Summary of filtered rows
  const filteredSummary = useMemo(() => {
    let totalOwedBy = 0;
    let totalOwedTo = 0;
    for (const tx of filteredTransactions) {
      if (tx.entryType === 'owedByAccount') {
        totalOwedBy += tx.amountMinor;
      } else {
        totalOwedTo += tx.amountMinor;
      }
    }
    return {
      count: filteredTransactions.length,
      totalOwedBy,
      totalOwedTo,
      netDelta: totalOwedBy - totalOwedTo,
    };
  }, [filteredTransactions]);

  const confirmDelete = async () => {
    if (!deletingTxId) return;
    await deleteTransaction(deletingTxId);
    setDeletingTxId(null);
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            دفتر الحركات المالية
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل شامل لجميع عمليات الذمم (عليه / له) مع تصفية دقيقة ومرفقات
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenInterAccountTransfer && (
            <button
              type="button"
              onClick={() => onOpenInterAccountTransfer()}
              className="py-2 px-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-purple-600/30 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>حركة بينية جديدة</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenQuickTx()}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل حركة جديدة</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="البحث بالبيان أو الطرف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 px-3 pr-8 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Account Picker */}
          <div>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-9 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:outline-hidden"
            >
              <option value="all">كل الأطراف والحسابات</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direction Segmented control */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium">
            <button
              type="button"
              onClick={() => setDirectionFilter('all')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                directionFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('owedByAccount')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                directionFilter === 'owedByAccount'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              عليه (+ لك)
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('owedToAccount')}
              className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer text-center ${
                directionFilter === 'owedToAccount'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              له (- عليك)
            </button>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-1/2 h-9 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300"
              title="من تاريخ"
            />
            <span className="text-slate-400 text-xs">إلى</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-1/2 h-9 px-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300"
              title="إلى تاريخ"
            />
          </div>
        </div>

        {/* Filter Summary Ribbon */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div>
            النتائج: <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">{filteredSummary.count}</span> حركة
          </div>
          <div className="flex items-center gap-4 font-mono">
            <div>
              مجموع عليه: <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">+{formatMinorAmount(filteredSummary.totalOwedBy)} {settings.currencySymbol}</span>
            </div>
            <div>
              مجموع له: <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">-{formatMinorAmount(filteredSummary.totalOwedTo)} {settings.currencySymbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            لا توجد حركات مالية مطابقة للفلاتر المحددة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                <tr>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">الطرف / الحساب</th>
                  <th className="py-3 px-4">البيان والوصف</th>
                  <th className="py-3 px-4">النوع</th>
                  <th className="py-3 px-4 text-left">المبلغ</th>
                  <th className="py-3 px-4 text-center">المرفقات</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredTransactions.map((tx) => {
                  const acc = accounts.find((a) => a.id === tx.accountId);
                  const isOwedBy = tx.entryType === 'owedByAccount';
                  const isTransfer = Boolean(tx.transferId);
                  const counterparty = isTransfer && tx.counterpartyAccountId
                    ? accounts.find((a) => a.id === tx.counterpartyAccountId)
                    : null;
                  const txAttachments = attachments.filter((att) =>
                    tx.attachmentIds?.includes(att.id)
                  );

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {tx.date}
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenStatementForAccount(tx.accountId)}
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
                        >
                          <span>{acc?.name || 'حساب غير معروف'}</span>
                          <FileSpreadsheet className="w-3 h-3 text-slate-400 inline" />
                        </button>
                      </td>

                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{tx.description}</span>
                          {isTransfer && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300">
                              <ArrowLeftRight className="w-3 h-3" />
                              <span>حركة بينية</span>
                            </span>
                          )}
                        </div>
                        {isTransfer && counterparty && (
                          <div className="text-[11px] text-purple-700 dark:text-purple-400 font-medium mt-0.5">
                            {tx.transferRole === 'source' ? (
                              <span>نقل مديونية إلى: <strong>{counterparty.name}</strong></span>
                            ) : (
                              <span>مديونية محولة من: <strong>{counterparty.name}</strong></span>
                            )}
                          </div>
                        )}
                        {tx.notes && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{tx.notes}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            isOwedBy
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isOwedBy ? (
                            <>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              <span>عليه (+ لك)</span>
                            </>
                          ) : (
                            <>
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                              <span>له (- عليك)</span>
                            </>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-left font-mono whitespace-nowrap">
                        <span
                          className={`font-bold tabular-nums text-sm ${
                            isOwedBy
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isOwedBy ? '+' : '-'}
                          {formatMinorAmount(tx.amountMinor)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-sans mr-1">{settings.currencySymbol}</span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {txAttachments.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            {txAttachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => {
                                  setPreviewAttachmentsList(txAttachments);
                                  setPreviewIndex(txAttachments.findIndex((a) => a.id === att.id));
                                }}
                                className="p-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer"
                                title={`معاينة: ${att.originalName}`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {isTransfer ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditInterAccountTransfer?.(tx.transferId!)}
                                className="p-1 rounded-lg text-purple-600 hover:text-purple-900 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer"
                                title="تعديل الحركة البينية لكلا الطرفين"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTransferId(tx.transferId!)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                title="حذف الحركة البينية لكلا الطرفين"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditTransaction(tx)}
                                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="تعديل الحركة"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingTxId(tx.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                title="حذف الحركة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Regular Transaction Delete Confirmation Modal */}
      {deletingTxId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-5 text-center">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
              تأكيد حذف الحركة المالية
            </h4>
            <p className="text-xs text-slate-500 mb-5">
              هل أنت متأكد من حذف هذه الحركة؟ سيتم إعادة احتساب رصيد الحساب واللوحة وكشف الحساب فوراً وبدقة.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingTxId(null)}
                className="py-2 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="py-2 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs cursor-pointer shadow-sm shadow-rose-600/30"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Delete Confirmation Modal (Milestone N1) */}
      {deletingTransferId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تأكيد حذف الحركة البينية
              </h4>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                هذه حركة بينية مترابطة بين حسابين. سيتم حذف طرفي الحركة معاً واستعادة الأرصدة السابقة قبل الحوالة في كلا الحسابين للحفاظ على توازن المركز المالي. هل ترغب بالتأكيد؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTransferId(null)}
                className="py-2.5 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (deletingTransferId) {
                    await deleteInterAccountTransfer(deletingTransferId);
                    setDeletingTransferId(null);
                  }
                }}
                className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer shadow-sm shadow-rose-600/30"
              >
                حذف طرفي الحركة معاً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Preview Modal Component */}
      <AttachmentPreviewModal
        attachments={previewAttachmentsList}
        initialIndex={previewIndex}
        isOpen={previewAttachmentsList.length > 0}
        onClose={() => setPreviewAttachmentsList([])}
      />
    </div>
  );
};
