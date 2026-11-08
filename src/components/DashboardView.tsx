/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Financial Dashboard View
 * Displays 3 Hero Financial Cards (لك, عليك, الصافي) and recent activity
 */

import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  ReceiptText,
  PlusCircle,
  FileSpreadsheet,
  ChevronLeft,
} from 'lucide-react';
import { TabView } from './Sidebar.tsx';

interface DashboardViewProps {
  onNavigateTab: (tab: TabView) => void;
  onOpenQuickTx: (accountId?: string) => void;
  onSelectAccountForStatement?: (accountId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onOpenQuickTx,
  onSelectAccountForStatement,
}) => {
  const { dashboardSummary, accounts, transactions, settings } = useApp();

  const recentTransactions = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  }).slice(0, 6);

  const activeAccounts = accounts.filter((a) => a.status === 'active');

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            ملخص المركز المالي
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            نظرة شاملة ودقيقة على الذمم الشخصية والأرصدة المستحقة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenQuickTx()}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل حركة جديدة</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('statement')}
            className="py-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <span>كشف الحساب</span>
          </button>
        </div>
      </div>

      {/* 3 Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: لك (Total Receivable) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>إجمالي لك (مستحق لك طرف الغير)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">{settings.currencyCode}</span>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 tracking-tight">
            {formatMinorAmount(dashboardSummary.totalReceivableMinor)}
            <span className="text-xs font-sans font-medium text-slate-400 mr-1.5">{settings.currencySymbol}</span>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
            <span>مجموع الأرصدة الإيجابية</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {accounts.filter((a) => (dashboardSummary.accountBalances.get(a.id) || 0) > 0).length} أطراف
            </span>
          </div>
        </div>

        {/* Card 2: عليك (Total Payable) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <span>إجمالي عليك (التزامات مستحقة للغير)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">{settings.currencyCode}</span>
          </div>

          <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-slate-100 tracking-tight">
            {formatMinorAmount(dashboardSummary.totalPayableMinor)}
            <span className="text-xs font-sans font-medium text-slate-400 mr-1.5">{settings.currencySymbol}</span>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
            <span>مجموع الأرصدة السلبية</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {accounts.filter((a) => (dashboardSummary.accountBalances.get(a.id) || 0) < 0).length} أطراف
            </span>
          </div>
        </div>

        {/* Card 3: صافي المركز المالي (Net Balance = لك - عليك) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-slate-500" />
              <span>صافي المركز المالي (لك − عليك)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">SAR</span>
          </div>

          <div
            className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight ${
              dashboardSummary.netBalanceMinor > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : dashboardSummary.netBalanceMinor < 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {formatCurrency(dashboardSummary.netBalanceMinor, { showSign: true })}
          </div>

          <div className="mt-3 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
            <span>
              {dashboardSummary.netBalanceMinor > 0
                ? 'فائض مستحق لصالحك'
                : dashboardSummary.netBalanceMinor < 0
                ? 'صافي التزام في ذمتك'
                : 'الذمم متوازنة تماماً'}
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {dashboardSummary.activeAccountsCount} حسابات نشطة
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Recent Transactions & Active Accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (2 cols on large screen) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                أحدث الحركات المالية
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('transactions')}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>عرض كل الحركات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              لا توجد حركات مالية مسجلة بعد. استخدم زر «تسجيل حركة جديدة» للبدء.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {recentTransactions.map((tx) => {
                const account = accounts.find((a) => a.id === tx.accountId);
                const isOwedBy = tx.entryType === 'owedByAccount';
                return (
                  <div
                    key={tx.id}
                    className="py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isOwedBy
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isOwedBy ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {tx.description}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {account?.name || 'حساب محذوف'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{tx.date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left font-mono">
                      <div
                        className={`text-xs font-bold tabular-nums ${
                          isOwedBy
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isOwedBy ? '+' : '-'}
                        {formatMinorAmount(tx.amountMinor)} {settings.currencySymbol}
                      </div>
                      <div className="text-[10px] text-slate-400 font-sans">
                        {isOwedBy ? 'عليه (لك)' : 'له (عليك/سداد)'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Accounts Overview (1 col) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                أبرز الأطراف والحسابات
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('accounts')}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>دليل الحسابات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[360px]">
            {activeAccounts.slice(0, 6).map((acc) => {
              const balance = dashboardSummary.accountBalances.get(acc.id) || 0;
              return (
                <div
                  key={acc.id}
                  className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer"
                  onClick={() => {
                    if (onSelectAccountForStatement) {
                      onSelectAccountForStatement(acc.id);
                    }
                  }}
                >
                  <div className="truncate">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {acc.name}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      {acc.parentId ? <span>فرع</span> : <span>رئيسي</span>}
                      {acc.phone && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{acc.phone}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-left font-mono shrink-0">
                    <div
                      className={`text-xs font-bold tabular-nums ${
                        balance > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : balance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {formatCurrency(balance, { showSign: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('accounts')}
            className="mt-4 w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>إضافة طرف أو حساب جديد</span>
          </button>
        </div>
      </div>
    </div>
  );
};
