/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Account Statement & Detailed Financial Reports
 * Sequential running balance, opening & closing period calculations, print & CSV export
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { calculateAccountStatement } from '../domain/balance_calculator.ts';
import { buildStatementCSV } from '../domain/account_privacy.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import { generatePdfReport } from '../services/pdf_export.ts';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Users,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  ArrowLeftRight,
} from 'lucide-react';

interface StatementViewProps {
  initialAccountId?: string;
}

export const StatementView: React.FC<StatementViewProps> = ({ initialAccountId }) => {
  const { accounts, transactions, settings } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || (accounts[0]?.id || '')
  );
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

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

  // Compute Statement
  const statement = useMemo(() => {
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

  // CSV Export with UTF-8 BOM
  const exportCSV = () => {
    if (!selectedAccount) return;

    const csvContent = buildStatementCSV(selectedAccount, accounts, statement, fromDate, toDate);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statement_${selectedAccount.name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!selectedAccount) return;

    generatePdfReport({
      reportTitle: `كشف حساب: ${selectedAccount.name}`,
      subtitle: `الفترة من ${fromDate || 'بداية التعامل'} إلى ${toDate || 'تاريخ اليوم'}`,
      ownerName: settings.ownerName,
      currencySymbol: settings.currencySymbol,
      metrics: [
        {
          title: 'رصيد أول المدة',
          value: formatCurrency(statement.openingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
          colorClass: 'slate',
        },
        {
          title: 'إجمالي عليه (خلال الفترة)',
          value: `+${formatMinorAmount(statement.totalOwedByMinor)} ${settings.currencySymbol}`,
          colorClass: 'emerald',
        },
        {
          title: 'إجمالي له (خلال الفترة)',
          value: `-${formatMinorAmount(statement.totalOwedToMinor)} ${settings.currencySymbol}`,
          colorClass: 'rose',
        },
        {
          title: 'رصيد آخر المدة (الختامي)',
          value: formatCurrency(statement.closingBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
          colorClass: 'blue',
        },
      ],
      columns: [
        { header: '#', align: 'center' },
        { header: 'التاريخ', align: 'center' },
        { header: 'البيان والوصف', align: 'right' },
        { header: 'عليه (+ لك)', align: 'right' },
        { header: 'له (- عليك)', align: 'right' },
        { header: 'الرصيد المتتابع', align: 'right' },
      ],
      rows: statement.rows.map((r, idx) => [
        idx + 1,
        r.transaction.date,
        r.transaction.description + (r.transaction.notes ? ` (${r.transaction.notes})` : ''),
        r.transaction.entryType === 'owedByAccount' ? `+${formatMinorAmount(r.transaction.amountMinor)}` : '—',
        r.transaction.entryType === 'owedToAccount' ? `-${formatMinorAmount(r.transaction.amountMinor)}` : '—',
        formatCurrency(r.runningBalanceMinor, { showSign: true, symbol: settings.currencySymbol }),
      ]),
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={!selectedAccount || statement.rows.length === 0}
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

        {/* Quick Presets */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
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
      </div>

      {/* Statement Printable Sheet Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs p-6 print:border-none print:shadow-none print:p-0">
        {/* Printable Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold mb-1">
              راكان بلانس | RAKAN BALANCE
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              كشف حساب: {selectedAccount?.name || '—'}
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
            <div className="text-[11px] text-slate-500 mb-1">رصيد أول المدة</div>
            <div
              className={`text-base font-extrabold font-mono tabular-nums ${
                statement.openingBalanceMinor > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : statement.openingBalanceMinor < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(statement.openingBalanceMinor, { showSign: true, symbol: settings.currencySymbol })}
            </div>
          </div>

          {/* 2. Total Owed By in Period */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 mb-1">إجمالي عليه (خلال الفترة)</div>
            <div className="text-base font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{formatMinorAmount(statement.totalOwedByMinor)} {settings.currencySymbol}
            </div>
          </div>

          {/* 3. Total Owed To in Period */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 mb-1">إجمالي له (خلال الفترة)</div>
            <div className="text-base font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400">
              -{formatMinorAmount(statement.totalOwedToMinor)} {settings.currencySymbol}
            </div>
          </div>

          {/* 4. Closing Balance */}
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
              رصيد آخر المدة (الختامي)
            </div>
            <div
              className={`text-base font-extrabold font-mono tabular-nums ${
                statement.closingBalanceMinor > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : statement.closingBalanceMinor < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(statement.closingBalanceMinor, { showSign: true })}
            </div>
          </div>
        </div>

        {/* Sequential Movements Table */}
        {statement.rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            لا توجد حركات مسجلة لهذا الحساب خلال الفترة المحددة.
            <div className="mt-1 font-mono">
              رصيد آخر المدة مطابق لرصيد أول المدة: {formatCurrency(statement.openingBalanceMinor)}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-800/80 border-y border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                <tr>
                  <th className="py-2.5 px-3 text-center w-12">#</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">البيان والوصف</th>
                  <th className="py-2.5 px-3 text-left">عليه (+ لك)</th>
                  <th className="py-2.5 px-3 text-left">له (- عليك)</th>
                  <th className="py-2.5 px-3 text-left">الرصيد بعد الحركة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {/* Initial Period Opening Row */}
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 italic text-slate-500">
                  <td className="py-2.5 px-3 text-center font-mono">—</td>
                  <td className="py-2.5 px-3 font-mono">{fromDate || 'بداية التعامل'}</td>
                  <td className="py-2.5 px-3 font-medium">رصيد أول المدة</td>
                  <td className="py-2.5 px-3 text-left font-mono">—</td>
                  <td className="py-2.5 px-3 text-left font-mono">—</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold tabular-nums">
                    {formatCurrency(statement.openingBalanceMinor, { showSign: true })}
                  </td>
                </tr>

                {/* Movements Rows */}
                {statement.rows.map((row, idx) => {
                  const isOwedBy = row.transaction.entryType === 'owedByAccount';
                  return (
                    <tr
                      key={row.transaction.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {row.transaction.date}
                      </td>
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
        )}

        {/* Printable Footer note */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>تم استخراج هذا الكشف من منصة راكان بلانس (RAKAN BALANCE)</span>
        </div>
      </div>
    </div>
  );
};
