/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Account Statement & Detailed Financial Reports
 * Sequential running balance, opening & closing period calculations, print & CSV export
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { calculateAccountStatement } from '../domain/balance_calculator.ts';
import {
  calculateConsolidatedStatement,
  createHierarchyIndex,
} from '../domain/hierarchical_accounts.ts';
import { buildConsolidatedStatementCSV, buildStatementCSV } from '../domain/account_privacy.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import { generatePdfReport } from '../services/pdf_export.ts';
import {
  exportConsolidatedParentAccountToExcel,
  exportDirectAccountToExcel,
} from '../services/excel_export.ts';
import { createStatementPdf } from '../services/statement_pdf_file.ts';
import { AttachmentPreviewModal } from './AttachmentPreviewModal.tsx';
import { ShareWhatsAppModal } from './ShareWhatsAppModal.tsx';
import { buildStatementShareMessage } from '../services/whatsapp_share_service.ts';
import { AttachmentModel, TransactionModel } from '../domain/types.ts';
import {
  FileSpreadsheet,
  FolderTree,
  Printer,
  Download,
  Calendar,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  ArrowLeftRight,
  Paperclip,
  Send,
} from 'lucide-react';

interface StatementViewProps {
  initialAccountId?: string;
  onEditTransaction?: (tx: TransactionModel) => void;
  onEditInterAccountTransfer?: (transferId: string) => void;
}

export const StatementView: React.FC<StatementViewProps> = ({
  initialAccountId,
  onEditTransaction,
  onEditInterAccountTransfer,
}) => {
  const { accounts, categories, transactions, attachments, settings } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || (accounts[0]?.id || '')
  );
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [statementMode, setStatementMode] = useState<'direct' | 'consolidated'>('direct');

  // Attachment Preview Modal
  const [previewAttachmentsList, setPreviewAttachmentsList] = useState<AttachmentModel[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // WhatsApp Share State
  const [statementShareOpen, setStatementShareOpen] = useState<boolean>(false);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const hierarchyIndex = useMemo(
    () => createHierarchyIndex(accounts, transactions),
    [accounts, transactions]
  );

  const descendantIds = useMemo(
    () => (selectedAccount ? hierarchyIndex.getDescendantIds(selectedAccount.id) : []),
    [selectedAccount, hierarchyIndex]
  );

  const isSelectedParent = descendantIds.length > 0;
  const effectiveMode: 'direct' | 'consolidated' = isSelectedParent ? statementMode : 'direct';

  const handleRowClick = (tx: TransactionModel) => {
    if (tx.transferId) {
      if (onEditInterAccountTransfer) {
        onEditInterAccountTransfer(tx.transferId);
      }
    } else {
      if (onEditTransaction) {
        onEditTransaction(tx);
      }
    }
  };

  // Quick period presets
  const applyPreset = (preset: 'all' | 'thisMonth' | 'last30Days') => {
    const now = new Date();
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'thisMonth') {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      setFromDate(`${year}-${month}-01`);
      setToDate(now.toISOString().split('T')[0]);
    } else if (preset === 'last30Days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(now.toISOString().split('T')[0]);
    }
  };

  // Compute Direct Statement
  const directStatement = useMemo(() => {
    if (!selectedAccount) {
      return {
        openingBalanceMinor: 0,
        closingBalanceMinor: 0,
        totalOwedByMinor: 0,
        totalOwedToMinor: 0,
        rows: [],
      };
    }
    return calculateAccountStatement(selectedAccount, transactions, fromDate || undefined, toDate || undefined);
  }, [selectedAccount, transactions, fromDate, toDate]);

  // Compute Consolidated Statement (when parent account & consolidated mode active)
  const consolidatedStatement = useMemo(() => {
    if (!selectedAccount || effectiveMode !== 'consolidated') return null;
    return calculateConsolidatedStatement(
      selectedAccount.id,
      accounts,
      transactions,
      fromDate || undefined,
      toDate || undefined
    );
  }, [selectedAccount, effectiveMode, accounts, transactions, fromDate, toDate]);

  const activeSummary = useMemo(() => {
    if (effectiveMode === 'consolidated' && consolidatedStatement) {
      return {
        openingBalanceMinor: consolidatedStatement.openingConsolidatedBalanceMinor,
        closingBalanceMinor: consolidatedStatement.closingConsolidatedBalanceMinor,
        totalOwedByMinor: consolidatedStatement.totalOwedByMinor,
        totalOwedToMinor: consolidatedStatement.totalOwedToMinor,
        rowsCount: consolidatedStatement.rows.length,
      };
    }
    return {
      openingBalanceMinor: directStatement.openingBalanceMinor,
      closingBalanceMinor: directStatement.closingBalanceMinor,
      totalOwedByMinor: directStatement.totalOwedByMinor,
      totalOwedToMinor: directStatement.totalOwedToMinor,
      rowsCount: directStatement.rows.length,
    };
  }, [effectiveMode, consolidatedStatement, directStatement]);

  // Normalized rows for rendering both modes cleanly
  const displayRows = useMemo(() => {
    if (effectiveMode === 'consolidated' && consolidatedStatement) {
      return consolidatedStatement.rows.map((r) => ({
        transaction: r.transaction,
        runningBalanceMinor: r.runningConsolidatedBalanceMinor,
        sourceAccountName: r.sourceAccountName,
        hierarchicalPath: r.hierarchicalPath,
      }));
    }
    return directStatement.rows.map((r) => ({
      transaction: r.transaction,
      runningBalanceMinor: r.runningBalanceMinor,
      sourceAccountName: selectedAccount?.name || '',
      hierarchicalPath: selectedAccount?.name || '',
    }));
  }, [effectiveMode, consolidatedStatement, directStatement, selectedAccount]);

  // CSV Export with UTF-8 BOM
  const exportCSV = () => {
    if (!selectedAccount) return;

    const csvContent =
      effectiveMode === 'consolidated' && consolidatedStatement
        ? buildConsolidatedStatementCSV(selectedAccount, accounts, consolidatedStatement, fromDate, toDate)
        : buildStatementCSV(selectedAccount, accounts, directStatement, fromDate, toDate);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = effectiveMode === 'consolidated' ? '_consolidated' : '';
    link.download = `statement_${selectedAccount.name}${suffix}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Excel Export: strictly follows active mode ('direct' vs 'consolidated')
  const exportExcel = () => {
    if (!selectedAccount) return;
    const baseParams = {
      accountId: selectedAccount.id,
      accounts,
      transactions,
      categories,
      currencySymbol: settings.currencySymbol,
      currencyName: settings.currencyName,
      ownerName: settings.ownerName,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    if (effectiveMode === 'consolidated') {
      exportConsolidatedParentAccountToExcel(baseParams);
    } else {
      exportDirectAccountToExcel(baseParams);
    }
  };

  const createPdfForShare = () => {
    if (!selectedAccount) throw new Error('يرجى تحديد الحساب أولاً.');
    const titlePrefix = effectiveMode === 'consolidated' ? `كشف مجمع: ${selectedAccount.name}` : selectedAccount.name;
    return createStatementPdf({
      accountName: titlePrefix,
      ownerName: settings.ownerName,
      periodLabel: `الفترة من ${fromDate || 'بداية التعامل'} إلى ${toDate || 'تاريخ اليوم'}`,
      currencySymbol: settings.currencySymbol,
      openingBalance: formatCurrency(activeSummary.openingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
      totalOwedBy: `+${formatMinorAmount(activeSummary.totalOwedByMinor)} ${settings.currencySymbol}`,
      totalOwedTo: `-${formatMinorAmount(activeSummary.totalOwedToMinor)} ${settings.currencySymbol}`,
      closingBalance: formatCurrency(activeSummary.closingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
      rows: displayRows.map((row) => ({
        date: row.transaction.date,
        description:
          effectiveMode === 'consolidated'
            ? `[${row.sourceAccountName}] ${row.transaction.description}`
            : row.transaction.description,
        owedBy: row.transaction.entryType === 'owedByAccount' ? `+${formatMinorAmount(row.transaction.amountMinor)}` : '—',
        owedTo: row.transaction.entryType === 'owedToAccount' ? `-${formatMinorAmount(row.transaction.amountMinor)}` : '—',
        runningBalance: formatCurrency(row.runningBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
      })),
    });
  };

  const handlePrint = () => {
    if (!selectedAccount) return;

    const isConsolidated = effectiveMode === 'consolidated' && consolidatedStatement;

    generatePdfReport({
      reportTitle: isConsolidated
        ? `كشف حساب مجمع: ${selectedAccount.name}`
        : `كشف حساب: ${selectedAccount.name}`,
      subtitle: isConsolidated
        ? `يشمل الحساب الرئيسي + ${consolidatedStatement.descendantCount} فروع وتوابع · الفترة من ${fromDate || 'بداية التعامل'} إلى ${toDate || 'تاريخ اليوم'}`
        : `الفترة من ${fromDate || 'بداية التعامل'} إلى ${toDate || 'تاريخ اليوم'}`,
      ownerName: settings.ownerName,
      currencySymbol: settings.currencySymbol,
      metrics: [
        {
          title: isConsolidated ? 'رصيد أول المدة المجمع' : 'رصيد أول المدة',
          value: formatCurrency(activeSummary.openingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
          colorClass: 'slate',
        },
        {
          title: 'إجمالي عليه (خلال الفترة)',
          value: `+${formatMinorAmount(activeSummary.totalOwedByMinor)} ${settings.currencySymbol}`,
          colorClass: 'emerald',
        },
        {
          title: 'إجمالي له (خلال الفترة)',
          value: `-${formatMinorAmount(activeSummary.totalOwedToMinor)} ${settings.currencySymbol}`,
          colorClass: 'rose',
        },
        {
          title: isConsolidated ? 'الرصيد الختامي المجمع' : 'رصيد آخر المدة (الختامي)',
          value: formatCurrency(activeSummary.closingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
          colorClass: 'blue',
        },
      ],
      columns: isConsolidated
        ? [
            { header: '#', align: 'center' },
            { header: 'التاريخ', align: 'center' },
            { header: 'الحساب المصدر / المسار', align: 'right' },
            { header: 'البيان والوصف', align: 'right' },
            { header: 'عليه (+ لك)', align: 'right' },
            { header: 'له (- عليك)', align: 'right' },
            { header: 'الرصيد المجمع', align: 'right' },
          ]
        : [
            { header: '#', align: 'center' },
            { header: 'التاريخ', align: 'center' },
            { header: 'البيان والوصف', align: 'right' },
            { header: 'عليه (+ لك)', align: 'right' },
            { header: 'له (- عليك)', align: 'right' },
            { header: 'الرصيد المتتابع', align: 'right' },
          ],
      rows: displayRows.map((r, idx) =>
        isConsolidated
          ? [
              idx + 1,
              r.transaction.date,
              `${r.sourceAccountName}${r.hierarchicalPath !== r.sourceAccountName ? ` (${r.hierarchicalPath})` : ''}`,
              r.transaction.description + (r.transaction.notes ? ` (${r.transaction.notes})` : ''),
              r.transaction.entryType === 'owedByAccount' ? `+${formatMinorAmount(r.transaction.amountMinor)}` : '—',
              r.transaction.entryType === 'owedToAccount' ? `-${formatMinorAmount(r.transaction.amountMinor)}` : '—',
              formatCurrency(r.runningBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
            ]
          : [
              idx + 1,
              r.transaction.date,
              r.transaction.description + (r.transaction.notes ? ` (${r.transaction.notes})` : ''),
              r.transaction.entryType === 'owedByAccount' ? `+${formatMinorAmount(r.transaction.amountMinor)}` : '—',
              r.transaction.entryType === 'owedToAccount' ? `-${formatMinorAmount(r.transaction.amountMinor)}` : '—',
              formatCurrency(r.runningBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
            ]
      ),
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            كشف الحساب والتقارير المالية
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            عرض تسلسلي دقيق للحركات مع احتساب رصيد أول الفترة والرصيد المتتابع
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatementShareOpen(true)}
            disabled={!selectedAccount}
            data-ui-effect="animated-whatsapp-share"
            className="rakan-share-motion-button py-2 px-3.5 rounded-xl font-medium text-xs flex items-center gap-2 cursor-pointer"
            title="إرسال ملخص كشف الحساب عبر واتساب"
          >
            <Send className="rakan-share-arrow w-4 h-4" />
            <span className="relative z-10">مشاركة واتساب</span>
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!selectedAccount}
            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            title="تصدير كشف الحساب بصيغة Excel متعددة الصفحات"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button
            type="button"
            onClick={exportCSV}
            disabled={!selectedAccount || activeSummary.rowsCount === 0}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!selectedAccount}
            className="py-2 px-3.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الكشف</span>
          </button>
        </div>
      </div>

      {/* Account & Date Range Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-3 no-print">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Account Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              اختر الطرف أو الحساب:
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.status === 'archived' ? '(مؤرشف)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range: From */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              من تاريخ:
            </label>
            <div className="relative">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full h-10 px-3 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Date Range: To */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              إلى تاريخ:
            </label>
            <div className="relative">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full h-10 px-3 pr-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Quick Presets & Consolidated Mode Switch (for Parent Accounts) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>اختصار الفترة:</span>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer font-medium"
            >
              كامل المدة
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer font-medium"
            >
              هذا الشهر
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last30Days')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer font-medium"
            >
              آخر 30 يوماً
            </button>
          </div>

          {isSelectedParent && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setStatementMode('direct')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  effectiveMode === 'direct'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                كشف مباشر
              </button>
              <button
                type="button"
                onClick={() => setStatementMode('consolidated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  effectiveMode === 'consolidated'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>كشف مجمع ({descendantIds.length} فروع)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Statement Printable Sheet Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-6 print:border-none print:shadow-none print:p-0">
        {/* Printable Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold mb-1">
              راكان بلانس | RAKAN BALANCE
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-2">
              <span>
                {effectiveMode === 'consolidated'
                  ? `كشف حساب مجمع: ${selectedAccount?.name || '—'}`
                  : `كشف حساب: ${selectedAccount?.name || '—'}`}
              </span>
              {effectiveMode === 'consolidated' && consolidatedStatement && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                  الحساب + {consolidatedStatement.descendantCount} فروع وتوابع
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              الفترة: {fromDate || 'بداية التعامل'} إلى {toDate || 'تاريخ اليوم'} · العملة: {settings.currencyName || 'ريال سعودي'} ({settings.currencyCode})
            </p>
          </div>

          <div className="text-left font-mono">
            <div className="text-xs text-slate-400">تاريخ إصدار الكشف</div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {new Date().toLocaleDateString('ar-SA')} ({new Date().toISOString().split('T')[0]})
            </div>
          </div>
        </div>

        {/* 4 Financial Period Summary Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {/* 1. Opening Balance */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 mb-1">
              {effectiveMode === 'consolidated' ? 'رصيد أول المدة المجمع' : 'رصيد أول المدة'}
            </div>
            <div
              className={`text-base font-extrabold font-mono tabular-nums ${
                activeSummary.openingBalanceMinor > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : activeSummary.openingBalanceMinor < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(activeSummary.openingBalanceMinor, { showSign: true, symbol: settings.currencySymbol })}
            </div>
          </div>

          {/* 2. Total Owed By in Period */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 mb-1">إجمالي عليه (خلال الفترة)</div>
            <div className="text-base font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{formatMinorAmount(activeSummary.totalOwedByMinor)} {settings.currencySymbol}
            </div>
          </div>

          {/* 3. Total Owed To in Period */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 mb-1">إجمالي له (خلال الفترة)</div>
            <div className="text-base font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400">
              -{formatMinorAmount(activeSummary.totalOwedToMinor)} {settings.currencySymbol}
            </div>
          </div>

          {/* 4. Closing Balance */}
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              {effectiveMode === 'consolidated' ? 'رصيد آخر المدة المجمع' : 'رصيد آخر المدة (الختامي)'}
            </div>
            <div
              className={`text-base font-extrabold font-mono tabular-nums ${
                activeSummary.closingBalanceMinor > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : activeSummary.closingBalanceMinor < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(activeSummary.closingBalanceMinor, { showSign: true })}
            </div>
          </div>
        </div>

        {/* Consolidated Mode Analytical Breakdown Strip */}
        {effectiveMode === 'consolidated' && consolidatedStatement && selectedAccount && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/50 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-emerald-900 dark:text-emerald-200">
                  الحساب الرئيسي: {selectedAccount.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-semibold">
                  عدد الفروع والتابعين: {consolidatedStatement.descendantCount}
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                كشف تحليلي مجمع (لا ينشئ قيوداً مكررة)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 text-[11px]">
              <div>
                <span className="text-slate-500 block">رصيد أول الفترة</span>
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(consolidatedStatement.openingConsolidatedBalanceMinor, { showSign: true, symbol: settings.currencySymbol })}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">إجمالي عليه</span>
                <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatMinorAmount(consolidatedStatement.totalOwedByMinor)} {settings.currencySymbol}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">إجمالي له</span>
                <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  -{formatMinorAmount(consolidatedStatement.totalOwedToMinor)} {settings.currencySymbol}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">صافي الحركة</span>
                <strong className="font-mono tabular-nums text-blue-600 dark:text-blue-400">
                  {formatCurrency(consolidatedStatement.netPeriodMovementMinor, { showSign: true, symbol: settings.currencySymbol })}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">الرصيد المباشر</span>
                <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(consolidatedStatement.directBalanceMinor, { showSign: true, symbol: settings.currencySymbol })}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">أرصدة التابعين</span>
                <strong className="font-mono tabular-nums text-amber-700 dark:text-amber-300">
                  {formatCurrency(consolidatedStatement.descendantsDirectSumMinor, { showSign: true, symbol: settings.currencySymbol })}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block">رصيد آخر الفترة</span>
                <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(consolidatedStatement.closingConsolidatedBalanceMinor, { showSign: true, symbol: settings.currencySymbol })}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Sequential Movements Table */}
        {displayRows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            لا توجد حركات مسجلة لهذا الحساب خلال الفترة المحددة.
            <div className="mt-1 font-mono">
              رصيد آخر المدة مطابق لرصيد أول المدة: {formatCurrency(activeSummary.openingBalanceMinor)}
            </div>
          </div>
        ) : (

          <>
            {/* Mobile statement uses full-width descriptions and separate totals. Desktop table/print remain unchanged. */}
            <div className="md:hidden space-y-3" data-testid="mobile-statement-list">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {effectiveMode === 'consolidated' ? 'رصيد أول المدة المجمع' : 'رصيد أول المدة'}
                </span>
                <span className="text-xs font-mono tabular-nums font-bold" dir="ltr">{formatCurrency(activeSummary.openingBalanceMinor, { showSign: true })}</span>
              </div>
              {displayRows.map((row, idx) => {
                const tx = row.transaction;
                const isOwedBy = tx.entryType === 'owedByAccount';
                const rowFiles = attachments.filter((att) => tx.attachmentIds?.includes(att.id));
                const counterparty = tx.transferId && tx.counterpartyAccountId
                  ? accounts.find((a) => a.id === tx.counterpartyAccountId) : null;
                return (
                  <article key={tx.id} data-testid="mobile-statement-card"
                    className="rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/60 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-slate-400">حركة #{idx + 1}</span>
                      <time dir="ltr" className="font-mono text-xs text-slate-500">{tx.date}</time>
                    </div>
                    {effectiveMode === 'consolidated' && (
                      <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 space-y-0.5">
                        <div className="font-bold">الحساب: {row.sourceAccountName}</div>
                        {row.hierarchicalPath !== row.sourceAccountName && (
                          <div className="text-[10px] text-slate-500">{row.hierarchicalPath}</div>
                        )}
                      </div>
                    )}
                    <button type="button" onClick={() => handleRowClick(tx)}
                      className="block w-full min-w-0 text-right text-sm font-semibold leading-7 text-slate-900 dark:text-slate-100 break-words whitespace-normal [overflow-wrap:anywhere]">
                      {tx.description}
                    </button>
                    {counterparty && <p className="text-xs text-purple-700 dark:text-purple-300 break-words">
                      حركة بينية — {counterparty.name}
                    </p>}
                    {tx.notes && <p className="text-xs leading-5 break-words text-slate-500">{tx.notes}</p>}
                    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                      <div>
                        <span className="block text-[10px] text-slate-500 mb-1">{isOwedBy ? 'عليه (+ لك)' : 'له (- عليك)'}</span>
                        <bdi dir="ltr" className={`font-mono tabular-nums text-sm font-bold ${isOwedBy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isOwedBy ? '+' : '-'}{formatMinorAmount(tx.amountMinor)}
                        </bdi>
                      </div>
                      <div className="text-left">
                        <span className="block text-[10px] text-slate-500 mb-1">
                          {effectiveMode === 'consolidated' ? 'الرصيد المجمع بعد الحركة' : 'الرصيد بعد الحركة'}
                        </span>
                        <bdi dir="ltr" className={`font-mono tabular-nums text-sm font-bold ${row.runningBalanceMinor > 0 ? 'text-emerald-600 dark:text-emerald-400' : row.runningBalanceMinor < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {formatCurrency(row.runningBalanceMinor, { showSign: true })}
                        </bdi>
                      </div>
                    </div>
                    {rowFiles.length > 0 && <div className="flex flex-wrap gap-2">
                      {rowFiles.map((att) => <button key={att.id} type="button"
                        aria-label={`معاينة: ${att.originalName}`}
                        onClick={() => { setPreviewAttachmentsList(rowFiles); setPreviewIndex(rowFiles.findIndex((a) => a.id === att.id)); }}
                        className="inline-flex items-center gap-1 text-[11px] px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <Paperclip className="w-4 h-4" /> <span className="max-w-32 truncate">{att.originalName}</span>
                      </button>)}
                    </div>}
                  </article>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  {effectiveMode === 'consolidated' && (
                    <th className="py-2.5 px-3">الحساب المصدر / المسار</th>
                  )}
                  <th className="py-2.5 px-3">البيان والوصف</th>
                  <th className="py-2.5 px-3 text-left">عليه (+ لك)</th>
                  <th className="py-2.5 px-3 text-left">له (- عليك)</th>
                  <th className="py-2.5 px-3 text-left">
                    {effectiveMode === 'consolidated' ? 'الرصيد المجمع بعد الحركة' : 'الرصيد بعد الحركة'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {/* Initial Period Opening Row */}
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 italic text-slate-500">
                  <td className="py-2.5 px-3 text-center font-mono">—</td>
                  <td className="py-2.5 px-3 font-mono">{fromDate || 'بداية التعامل'}</td>
                  {effectiveMode === 'consolidated' && (
                    <td className="py-2.5 px-3 font-medium">الشجرة كاملة</td>
                  )}
                  <td className="py-2.5 px-3 font-medium">
                    {effectiveMode === 'consolidated' ? 'رصيد أول المدة المجمع' : 'رصيد أول المدة'}
                  </td>
                  <td className="py-2.5 px-3 text-left font-mono">—</td>
                  <td className="py-2.5 px-3 text-left font-mono">—</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold tabular-nums">
                    {formatCurrency(activeSummary.openingBalanceMinor, { showSign: true })}
                  </td>
                </tr>

                {/* Movements Rows */}
                {displayRows.map((row, idx) => {
                  const isOwedBy = row.transaction.entryType === 'owedByAccount';
                  return (
                    <tr
                      key={row.transaction.id}
                      onClick={() => handleRowClick(row.transaction)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(row.transaction);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      title="انقر لعرض أو تعديل تفاصيل الحركة"
                      className="hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer focus:outline-hidden focus:bg-slate-100 dark:focus:bg-slate-800"
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {row.transaction.date}
                      </td>
                      {effectiveMode === 'consolidated' && (
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {row.sourceAccountName}
                          </div>
                          {row.hierarchicalPath !== row.sourceAccountName && (
                            <div className="text-[10px] text-slate-400">
                              {row.hierarchicalPath}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                        {(() => {
                          const isTransfer = Boolean(row.transaction.transferId);
                          const counterparty =
                            isTransfer && row.transaction.counterpartyAccountId
                              ? accounts.find((a) => a.id === row.transaction.counterpartyAccountId)
                              : null;

                          return (
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    isOwedBy
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {isOwedBy ? 'عليه' : 'له'}
                                </span>
                                <span>{row.transaction.description}</span>
                                {isTransfer && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300">
                                    <ArrowLeftRight className="w-3 h-3" />
                                    <span>حركة بينية</span>
                                  </span>
                                )}
                              </div>
                              {isTransfer && counterparty && (
                                <div className="text-[11px] text-purple-700 dark:text-purple-400 font-medium mt-0.5">
                                  {row.transaction.transferRole === 'source' ? (
                                    <span>نقل مديونية إلى: <strong>{counterparty.name}</strong></span>
                                  ) : (
                                    <span>مديونية محولة من: <strong>{counterparty.name}</strong></span>
                                  )}
                                </div>
                              )}
                              {row.transaction.notes && (
                                <div className="text-[10px] text-slate-400">{row.transaction.notes}</div>
                              )}
                              {(() => {
                                const rowAtts = attachments.filter((att) =>
                                  row.transaction.attachmentIds?.includes(att.id)
                                );
                                if (rowAtts.length === 0) return null;
                                return (
                                  <div className="flex items-center gap-1.5 mt-1 no-print">
                                    {rowAtts.map((att) => (
                                      <button
                                        key={att.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewAttachmentsList(rowAtts);
                                          setPreviewIndex(rowAtts.findIndex((a) => a.id === att.id));
                                        }}
                                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-slate-600 dark:text-slate-300 hover:text-emerald-600 cursor-pointer transition-colors"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span className="truncate max-w-[100px]">{att.originalName}</span>
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                        {isOwedBy ? `+${formatMinorAmount(row.transaction.amountMinor)}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                        {!isOwedBy ? `-${formatMinorAmount(row.transaction.amountMinor)}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono font-bold tabular-nums">
                        <span
                          className={
                            row.runningBalanceMinor > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : row.runningBalanceMinor < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-500'
                          }
                        >
                          {formatCurrency(row.runningBalanceMinor, { showSign: true })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}

        {/* Printable Footer note */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>تم استخراج هذا الكشف من منصة راكان بلانس (RAKAN BALANCE)</span>
        </div>
      </div>

      {/* Attachment Preview Modal Component */}
      <AttachmentPreviewModal
        attachments={previewAttachmentsList}
        initialIndex={previewIndex}
        isOpen={previewAttachmentsList.length > 0}
        onClose={() => setPreviewAttachmentsList([])}
      />

      {/* WhatsApp Statement Share Modal */}
      {selectedAccount && (
        <ShareWhatsAppModal
          isOpen={statementShareOpen}
          onClose={() => setStatementShareOpen(false)}
          accountName={selectedAccount.name}
          accountPhone={selectedAccount.phone}
          messageText={buildStatementShareMessage(
            effectiveMode === 'consolidated'
              ? `${selectedAccount.name} (كشف مجمع)`
              : selectedAccount.name,
            fromDate,
            toDate,
            activeSummary,
            settings.currencySymbol
          )}
          title={
            effectiveMode === 'consolidated'
              ? `مشاركة كشف الحساب المجمع: ${selectedAccount.name}`
              : `مشاركة كشف حساب: ${selectedAccount.name}`
          }
          onCreatePdf={createPdfForShare}
        />
      )}
    </div>
  );
};
