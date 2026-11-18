/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Financial Reports Dashboard Component
 * Unified ReportScope + Single Source of Truth between Screen, Excel, and PDF.
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
  generateDebtorsCreditorsReport,
  generatePeriodSummaryReport,
  ReportFilterOptions,
  ReportScope,
  validateReportScopeDates,
} from '../domain/financial_reports.ts';
import { generateHierarchicalAccountsReport } from '../domain/hierarchical_accounts.ts';
import { formatCurrency, formatMinorAmount } from '../domain/money.ts';
import {
  exportAccountsReportToExcel,
  exportCategoriesReportToExcel,
  exportComprehensiveAccountsReportToExcel,
  exportDebtorsCreditorsReportToExcel,
  exportPeriodReportToExcel,
} from '../services/excel_export.ts';
import {
  buildAccountsReportPdfConfig,
  buildCategoriesReportPdfConfig,
  buildDebtorsCreditorsReportPdfConfig,
  buildHierarchicalReportPdfConfig,
  buildPeriodReportPdfConfig,
  generatePdfReport,
} from '../services/pdf_export.ts';
import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderTree,
  Layers,
  Printer,
  Search,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';

export type ReportSubTab = 'accounts' | 'hierarchical' | 'categories' | 'period' | 'debtors_creditors';

interface FinancialReportsViewProps {
  onSelectAccountForStatement?: (accountId: string) => void;
}

export const FinancialReportsView: React.FC<FinancialReportsViewProps> = ({
  onSelectAccountForStatement,
}) => {
  const { accounts, transactions, categories, settings } = useApp();
  const currencySymbol = settings.currencySymbol;

  const [subTab, setSubTab] = useState<ReportSubTab>('accounts');

  // Unified Filter State
  const [periodPreset, setPeriodPreset] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Honest Per-Report Filter Capabilities (#8 & #23)
  const supportsCutoffOnly = subTab === 'debtors_creditors';
  const supportsDateRange = !supportsCutoffOnly;
  const supportsSearch = subTab !== 'categories';

  const handlePresetChange = (preset: string) => {
    setPeriodPreset(preset);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'this_month') {
      const firstDay = `${year}-${month}-01`;
      const lastDayDate = new Date(year, now.getMonth() + 1, 0);
      const lastDay = `${year}-${month}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
      setFromDate(firstDay);
      setToDate(lastDay);
    } else if (preset === 'last_month') {
      const prevMonthDate = new Date(year, now.getMonth() - 1, 1);
      const pYear = prevMonthDate.getFullYear();
      const pMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const pLastDayDate = new Date(pYear, prevMonthDate.getMonth() + 1, 0);
      setFromDate(`${pYear}-${pMonth}-01`);
      setToDate(`${pYear}-${pMonth}-${String(pLastDayDate.getDate()).padStart(2, '0')}`);
    } else if (preset === 'this_quarter') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const startMonth = String(currentQuarter * 3 + 1).padStart(2, '0');
      const endMonthNum = (currentQuarter + 1) * 3;
      const endMonth = String(endMonthNum).padStart(2, '0');
      const endDayDate = new Date(year, endMonthNum, 0);
      setFromDate(`${year}-${startMonth}-01`);
      setToDate(`${year}-${endMonth}-${String(endDayDate.getDate()).padStart(2, '0')}`);
    } else if (preset === 'this_year') {
      setFromDate(`${year}-01-01`);
      setToDate(`${year}-12-31`);
    }
  };

  // Date Guard Validation (#9)
  const dateValidation = useMemo(() => {
    if (supportsCutoffOnly) return { valid: true as const };
    return validateReportScopeDates({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
  }, [supportsCutoffOnly, fromDate, toDate]);

  // Unified ReportScope + Display-only Search Options
  const reportScope: ReportScope = useMemo(
    () => ({
      fromDate: supportsCutoffOnly ? undefined : fromDate || undefined,
      toDate: toDate || undefined,
      categoryId: selectedCategory,
      status: selectedStatus,
    }),
    [supportsCutoffOnly, fromDate, toDate, selectedCategory, selectedStatus]
  );

  const filterOptions: ReportFilterOptions = useMemo(
    () => ({
      ...reportScope,
      searchQuery: supportsSearch ? searchQuery : undefined,
    }),
    [reportScope, supportsSearch, searchQuery]
  );

  // Single Source of Truth Report Models (1 per Tab)
  const accountsReport = useMemo(
    () => generateAccountsBalanceReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  const hierarchicalReport = useMemo(
    () => generateHierarchicalAccountsReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  const categoriesReport = useMemo(
    () => generateCategorySummaryReport(accounts, transactions, categories, reportScope),
    [accounts, transactions, categories, reportScope]
  );

  const periodReport = useMemo(
    () => generatePeriodSummaryReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  const debtorsCreditorsReport = useMemo(
    () => generateDebtorsCreditorsReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  // Reset ONLY filters applicable to current tab (#22)
  const hasActiveFilterForTab = useMemo(() => {
    const dateDirty = supportsCutoffOnly ? Boolean(toDate) : Boolean(fromDate || toDate);
    const catDirty = selectedCategory !== 'all';
    const statusDirty = selectedStatus !== 'active';
    const searchDirty = supportsSearch && searchQuery.trim() !== '';
    return dateDirty || catDirty || statusDirty || searchDirty;
  }, [supportsCutoffOnly, fromDate, toDate, selectedCategory, selectedStatus, supportsSearch, searchQuery]);

  const handleResetTabFilters = () => {
    if (supportsCutoffOnly) {
      setToDate('');
      setPeriodPreset('all');
    } else {
      setPeriodPreset('all');
      setFromDate('');
      setToDate('');
    }
    setSelectedCategory('all');
    setSelectedStatus('active');
    if (supportsSearch) {
      setSearchQuery('');
    }
  };

  // Scope Metadata Banner Values (#15)
  const scopeInfo = useMemo(() => {
    const catName =
      selectedCategory === 'all'
        ? 'الكل'
        : selectedCategory === 'uncategorized'
        ? 'غير مصنف'
        : categories.find((c) => c.id === selectedCategory)?.name || 'الكل';

    const statusText =
      selectedStatus === 'active'
        ? 'نشطة'
        : selectedStatus === 'archived'
        ? 'مؤرشفة'
        : 'الكل (نشطة ومؤرشفة)';

    const periodText = supportsCutoffOnly
      ? toDate
        ? `حتى ${toDate}`
        : 'جميع الفترات'
      : fromDate || toDate
      ? `${fromDate || 'البداية'} — ${toDate || 'اليوم'}`
      : 'جميع الفترات';

    let includedCount = 0;
    let excludedCount = 0;
    let totalInSearchScope = 0;
    let matchedCount = 0;
    let unitLabel = 'حساب';

    if (subTab === 'accounts') {
      includedCount = accountsReport.totalScopedAccountsCount;
      excludedCount = accountsReport.excludedDormantCount;
      totalInSearchScope = accountsReport.totalScopedAccountsCount;
      matchedCount = accountsReport.searchMatchCount;
    } else if (subTab === 'hierarchical') {
      includedCount = hierarchicalReport.totalScopedAccountsCount;
      excludedCount = hierarchicalReport.excludedDormantCount;
      totalInSearchScope = hierarchicalReport.totalScopedAccountsCount;
      matchedCount = hierarchicalReport.searchMatchCount;
    } else if (subTab === 'categories') {
      includedCount = categoriesReport.includedAccountsCount;
      excludedCount = categoriesReport.excludedDormantCount;
    } else if (subTab === 'period') {
      includedCount = periodReport.includedAccountsCount;
      excludedCount = periodReport.excludedDormantCount;
      totalInSearchScope = periodReport.transactionsCount;
      matchedCount = periodReport.searchMatchCount;
      unitLabel = 'حركة';
    } else if (subTab === 'debtors_creditors') {
      includedCount = debtorsCreditorsReport.includedAccountsCount;
      excludedCount = debtorsCreditorsReport.excludedDormantCount;
      totalInSearchScope = debtorsCreditorsReport.includedAccountsCount;
      matchedCount = debtorsCreditorsReport.debtors.length + debtorsCreditorsReport.creditors.length;
    }

    return {
      periodText,
      statusText,
      catName,
      includedCount,
      excludedCount,
      totalInSearchScope,
      matchedCount,
      unitLabel,
    };
  }, [
    subTab,
    selectedCategory,
    selectedStatus,
    supportsCutoffOnly,
    fromDate,
    toDate,
    categories,
    accountsReport,
    hierarchicalReport,
    categoriesReport,
    periodReport,
    debtorsCreditorsReport,
  ]);

  // Export Trigger: Excel (uses exact Screen Report Model — Section 16)
  const handleExportExcel = () => {
    if (!dateValidation.valid) return;

    if (subTab === 'accounts') {
      exportAccountsReportToExcel(accountsReport, currencySymbol, {
        ownerName: settings.ownerName,
        currencyName: settings.currencyName,
      });
    } else if (subTab === 'hierarchical') {
      exportComprehensiveAccountsReportToExcel({
        accounts,
        transactions,
        categories,
        currencySymbol,
        currencyName: settings.currencyName,
        ownerName: settings.ownerName,
        filterOptions,
        report: hierarchicalReport,
        reportTitle: 'تقرير الحسابات الرئيسية والفروع (الشجرة المالية)',
      });
    } else if (subTab === 'categories') {
      exportCategoriesReportToExcel(categoriesReport, currencySymbol);
    } else if (subTab === 'period') {
      exportPeriodReportToExcel(periodReport, currencySymbol);
    } else if (subTab === 'debtors_creditors') {
      exportDebtorsCreditorsReportToExcel(debtorsCreditorsReport, currencySymbol);
    }
  };

  // Export Trigger: PDF / Print (uses exact Screen Report Model — Section 18)
  const handleExportPdfOrPrint = () => {
    if (!dateValidation.valid) return;

    const pdfMeta = { ownerName: settings.ownerName, currencySymbol };
    if (subTab === 'accounts') {
      generatePdfReport(buildAccountsReportPdfConfig(accountsReport, pdfMeta));
    } else if (subTab === 'hierarchical') {
      generatePdfReport(buildHierarchicalReportPdfConfig(hierarchicalReport, pdfMeta));
    } else if (subTab === 'categories') {
      generatePdfReport(buildCategoriesReportPdfConfig(categoriesReport, pdfMeta));
    } else if (subTab === 'period') {
      generatePdfReport(buildPeriodReportPdfConfig(periodReport, pdfMeta));
    } else if (subTab === 'debtors_creditors') {
      generatePdfReport(buildDebtorsCreditorsReportPdfConfig(debtorsCreditorsReport, pdfMeta));
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>التقارير المالية والتحليلية المتقدمة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تقارير مالية موحدة النطاق، تستبعد الحسابات الصفرية الخاملة تلقائيًا، وتطابق الشاشة مع Excel وPDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!dateValidation.valid}
            onClick={handleExportPdfOrPrint}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            title="طباعة أو حفظ بصيغة PDF"
          >
            <Printer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>طباعة / PDF</span>
          </button>

          <button
            type="button"
            disabled={!dateValidation.valid}
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
            title={subTab === 'hierarchical' ? 'تصدير التقرير الشامل المجمع Excel (.xlsx)' : 'تصدير التقرير الحالي Excel (.xlsx)'}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{subTab === 'hierarchical' ? 'تصدير التقرير الشامل' : 'تصدير Excel'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-900 rounded-xl overflow-x-auto text-xs font-medium">
        <button
          type="button"
          onClick={() => setSubTab('accounts')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'accounts'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>أرصدة الحسابات</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('hierarchical')}
          className={`flex-1 min-w-[165px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'hierarchical'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>الحسابات الرئيسية والفروع</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('categories')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'categories'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>تجميع التصنيفات</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('period')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'period'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>حركة الفترة الزمانية</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('debtors_creditors')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
            subTab === 'debtors_creditors'
              ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>تحليل لك / عليك</span>
        </button>
      </div>

      {/* Filter Control Bar — Honest per-tab supported controls (#8, #22, #23) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span>نطاق التقرير والتصفية</span>
          </div>
          {hasActiveFilterForTab && (
            <button
              type="button"
              onClick={handleResetTabFilters}
              className="text-[11px] text-rose-600 hover:underline cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Date Controls: Full range on 4 tabs, cutoff only on Debtors/Creditors */}
          {supportsDateRange && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">الفترة الزمنية</label>
                <select
                  value={periodPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">جميع الفترات</option>
                  <option value="this_month">الشهر الحالي</option>
                  <option value="last_month">الشهر السابق</option>
                  <option value="this_quarter">الربع الحالي</option>
                  <option value="this_year">السنة الحالية</option>
                  <option value="custom">تاريخ مخصص...</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">من تاريخ</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setPeriodPreset('custom');
                      setFromDate(e.target.value);
                    }}
                    className="w-full py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">إلى تاريخ</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setPeriodPreset('custom');
                      setToDate(e.target.value);
                    }}
                    className="w-full py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </>
          )}

          {supportsCutoffOnly && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">الرصيد حتى تاريخ</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setPeriodPreset(e.target.value ? 'custom' : 'all');
                  setToDate(e.target.value);
                }}
                className="w-full py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {/* Category Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">التصنيف</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">جميع التصنيفات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Account Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">حالة الحسابات</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'archived')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="active">النشطة فقط</option>
              <option value="archived">المؤرشفة فقط</option>
              <option value="all">الكل (النشطة والمؤرشفة)</option>
            </select>
          </div>

          {/* Display-Only Search Input (hidden in Categories tab where unsupported) */}
          {supportsSearch && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">بحث داخل النتائج</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={subTab === 'period' ? 'بحث بالحساب أو البيان...' : 'ابحث عن حساب...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full py-2 pr-8 pl-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
              </div>
            </div>
          )}
        </div>

        {/* Scope & Counters Bar (#15 + #4) */}
        {dateValidation.valid && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span><strong>الفترة:</strong> {scopeInfo.periodText}</span>
              <span><strong>الحالة:</strong> {scopeInfo.statusText}</span>
              <span><strong>التصنيف:</strong> {scopeInfo.catName}</span>
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                الحسابات المشمولة: {scopeInfo.includedCount}
              </span>
              <span className="text-slate-500">
                الحسابات الخاملة المستبعدة: {scopeInfo.excludedCount}
              </span>
            </div>

            {supportsSearch && searchQuery.trim() !== '' && (
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                نتيجة البحث: {scopeInfo.matchedCount} من أصل {scopeInfo.totalInSearchScope} {scopeInfo.unitLabel} (الإجماليات المالية ثابتة للنطاق)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Date Validation Error Banner (#9) */}
      {!dateValidation.valid && (
        <div className="p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-3 text-sm font-semibold">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{dateValidation.errorMessage}</span>
        </div>
      )}

      {/* SUB-TAB 1: Accounts Balance Report — Single Source of Truth (#10, #11) */}
      {dateValidation.valid && subTab === 'accounts' && (
        <div className="space-y-5">
          {/* Level 1: Exact 4 KPI Cards ONLY */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
                <span>إجمالي لك</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(accountsReport.totalReceivableMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
              <div className="flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 font-semibold mb-1">
                <span>إجمالي عليك</span>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(accountsReport.totalPayableMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-blue-50/80 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
              <div className="flex items-center justify-between text-xs text-blue-800 dark:text-blue-300 font-semibold mb-1">
                <span>الصافي</span>
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(accountsReport.netBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1">
                <span>عدد الحسابات ذات الصلة</span>
                <UserCheck className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {accountsReport.totalScopedAccountsCount} حساب
              </div>
            </div>
          </div>

          {/* Level 2: Clean 8-column Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                جدول أرصدة الحسابات والأطراف
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {accountsReport.rows.length} من أصل {accountsReport.totalScopedAccountsCount} حساب
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">الحساب</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">رصيد أول الفترة</th>
                    <th className="py-3 px-4">عليه</th>
                    <th className="py-3 px-4">له</th>
                    <th className="py-3 px-4">صافي الحركة</th>
                    <th className="py-3 px-4">رصيد آخر الفترة</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accountsReport.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        لا توجد حسابات ذات صلة تطابق خيارات التصفية المختارة.
                      </td>
                    </tr>
                  ) : (
                    accountsReport.rows.map((row) => (
                      <tr
                        key={row.account.id}
                        onClick={() => onSelectAccountForStatement?.(row.account.id)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{row.account.name}</span>
                            {row.account.status === 'archived' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                مؤرشف
                              </span>
                            )}
                          </div>
                          {row.hierarchicalPath !== row.account.name && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {row.hierarchicalPath}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{row.categoryName}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {formatCurrency(row.openingAtPeriodMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.totalOwedByMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-4 font-mono text-rose-600 dark:text-rose-400">
                          {formatCurrency(row.totalOwedToMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(row.netMovementMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">
                          <span
                            className={
                              row.currentBalanceMinor > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.currentBalanceMinor < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }
                          >
                            {formatCurrency(row.currentBalanceMinor, { symbol: currencySymbol })}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.balanceType === 'receivable'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : row.balanceType === 'payable'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {row.balanceType === 'receivable'
                              ? 'لك'
                              : row.balanceType === 'payable'
                              ? 'عليك'
                              : row.periodTransactionCount > 0
                              ? 'تمت التسوية'
                              : 'متزن'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {accountsReport.totalScopedAccountsCount > 0 && (
                  <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td className="py-3 px-4" colSpan={2}>
                        الإجمالي المالي للتقرير ({accountsReport.totalScopedAccountsCount} حساب)
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {formatCurrency(accountsReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(accountsReport.totalPeriodOwedByMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-4 font-mono text-rose-600 dark:text-rose-400">
                        {formatCurrency(accountsReport.totalPeriodOwedToMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-4 font-mono text-blue-600 dark:text-blue-400">
                        {formatCurrency(accountsReport.totalPeriodNetMovementMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {formatCurrency(accountsReport.totalClosingBalanceMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-4 text-center text-[11px]">
                        {accountsReport.netBalanceMinor > 0 ? 'صافي لك' : accountsReport.netBalanceMinor < 0 ? 'صافي عليك' : 'متزن'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Reorganized Hierarchical Report — Exact 4 Sections (#12, #13, #14) */}
      {dateValidation.valid && subTab === 'hierarchical' && (
        <div className="space-y-6">
          {/* SECTION 1 — الملخص المالي */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>1. الملخص المالي</span>
            </h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">رصيد أول الفترة</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-semibold">إجمالي عليه</div>
                <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  +{formatMinorAmount(hierarchicalReport.totalPeriodOwedByMinor)} {currencySymbol}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-semibold">إجمالي له</div>
                <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                  -{formatMinorAmount(hierarchicalReport.totalPeriodOwedToMinor)} {currencySymbol}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-semibold">صافي حركة الفترة</div>
                <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(hierarchicalReport.totalPeriodNetMovementMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-blue-50/80 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
                <div className="text-[11px] text-blue-800 dark:text-blue-300 font-semibold">رصيد آخر الفترة</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalClosingDirectBalanceMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">إجمالي لك</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalDirectReceivableMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
                <div className="text-[11px] text-rose-800 dark:text-rose-300 font-semibold">إجمالي عليك</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalDirectPayableMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <div className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">عدد الحسابات الفعالة في التقرير</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {hierarchicalReport.totalScopedAccountsCount} حساب
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2 — الحسابات الرئيسية */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-emerald-600" />
              <span>2. الحسابات الرئيسية ({hierarchicalReport.rootSummaries.length})</span>
            </h3>

            {hierarchicalReport.rootSummaries.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                لا توجد حسابات رئيسية ذات صلة ضمن النطاق المحدد.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {hierarchicalReport.rootSummaries.map((root) => (
                  <div
                    key={root.account.id}
                    onClick={() => onSelectAccountForStatement?.(root.account.id)}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-400 p-4 space-y-2.5 cursor-pointer transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{root.account.name}</span>
                          {root.account.status === 'archived' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              مؤرشف
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          الفروع الفعالة: {root.descendantCount} ({root.directChildrenCount} مباشر)
                        </div>
                      </div>
                      <span
                        className={`text-sm font-mono font-extrabold ${
                          root.consolidatedBalanceMinor > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : root.consolidatedBalanceMinor < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatCurrency(root.consolidatedBalanceMinor, { symbol: currencySymbol })}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">أول الفترة المجمع</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {formatCurrency(root.consolidatedOpeningAtPeriodMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">عليه المجمع</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatMinorAmount(root.consolidatedOwedByMinor)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">له المجمع</span>
                        <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                          -{formatMinorAmount(root.consolidatedOwedToMinor)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">صافي الحركة</span>
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {formatCurrency(root.consolidatedNetMovementMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block">الرصيد المجمع النهائي</span>
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                          {formatCurrency(root.consolidatedBalanceMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SECTION 3 — الشجرة المالية (Exact 10 Essential Columns) */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  3. الشجرة المالية
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  رصيد أول الفترة + عليه - له = الرصيد المباشر | الرصيد المجمع = الرصيد المباشر + رصيد التابعين ضمن النطاق.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {hierarchicalReport.rows.length} صف ظاهر من أصل {hierarchicalReport.totalScopedAccountsCount} حساب
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">الحساب</th>
                    <th className="py-3 px-3">المسار / المستوى</th>
                    <th className="py-3 px-3">رصيد أول الفترة</th>
                    <th className="py-3 px-3">عليه</th>
                    <th className="py-3 px-3">له</th>
                    <th className="py-3 px-3">صافي الحركة</th>
                    <th className="py-3 px-3">الرصيد المباشر</th>
                    <th className="py-3 px-3">رصيد التابعين</th>
                    <th className="py-3 px-3">الرصيد المجمع</th>
                    <th className="py-3 px-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {hierarchicalReport.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        لا توجد حسابات تطابق النطاق والبحث المحددين.
                      </td>
                    </tr>
                  ) : (
                    hierarchicalReport.rows.map((row) => (
                      <tr
                        key={row.account.id}
                        onClick={() => onSelectAccountForStatement?.(row.account.id)}
                        className={`cursor-pointer transition-colors ${
                          row.isSearchMatch
                            ? 'bg-amber-50/70 dark:bg-amber-950/25 hover:bg-amber-100/70'
                            : row.isParent
                            ? 'bg-emerald-50/30 dark:bg-emerald-950/15 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                          <div
                            className="flex flex-col"
                            style={{ paddingRight: `${Math.min(row.level, 6) * 16}px` }}
                          >
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {row.level > 0 && (
                                <span className="text-slate-400 font-mono text-[11px]">└</span>
                              )}
                              <span className={row.isParent ? 'font-bold' : ''}>{row.account.name}</span>
                              {row.isParent && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                  رئيسي ({row.descendantCount})
                                </span>
                              )}
                              {row.isSearchMatch && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                                  نتيجة بحث
                                </span>
                              )}
                              {row.hasExcludedParent && row.parentName && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  فرع تحت: {row.parentName} (خارج النطاق)
                                </span>
                              )}
                              {row.account.status === 'archived' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  مؤرشف
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          <div className="text-[11px]">{row.hierarchicalPath}</div>
                          <div className="text-[10px] text-slate-400 font-mono">مستوى {row.level} · {row.categoryName}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {formatCurrency(row.openingAtPeriodMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.directOwedByMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-3 font-mono text-rose-600 dark:text-rose-400">
                          {formatCurrency(row.directOwedToMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          {formatCurrency(row.directNetMovementMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold">
                          <span
                            className={
                              row.directBalanceMinor > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.directBalanceMinor < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }
                          >
                            {formatCurrency(row.directBalanceMinor, { symbol: currencySymbol })}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300">
                          {formatCurrency(row.consolidatedChildrenOnlyMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold">
                          <span
                            className={
                              row.consolidatedBalanceMinor > 0
                                ? 'text-amber-700 dark:text-amber-300'
                                : row.consolidatedBalanceMinor < 0
                                ? 'text-rose-700 dark:text-rose-300'
                                : 'text-slate-400'
                            }
                          >
                            {formatCurrency(row.consolidatedBalanceMinor, { symbol: currencySymbol })}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.consolidatedBalanceType === 'receivable'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : row.consolidatedBalanceType === 'payable'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {row.consolidatedBalanceType === 'receivable'
                              ? 'لك'
                              : row.consolidatedBalanceType === 'payable'
                              ? 'عليك'
                              : 'متزن'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {hierarchicalReport.totalScopedAccountsCount > 0 && (
                  <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td className="py-3 px-4" colSpan={2}>
                        الإجمالي المباشر للنطاق (بدون تكرار للأب والفروع) — {hierarchicalReport.totalScopedAccountsCount} حساب
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {formatCurrency(hierarchicalReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(hierarchicalReport.totalPeriodOwedByMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-3 font-mono text-rose-600 dark:text-rose-400">
                        {formatCurrency(hierarchicalReport.totalPeriodOwedToMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-600 dark:text-blue-400">
                        {formatCurrency(hierarchicalReport.totalPeriodNetMovementMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {formatCurrency(hierarchicalReport.totalClosingDirectBalanceMinor, { symbol: currencySymbol })}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]" colSpan={3}>
                        صافي مباشر مطابق
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* SECTION 4 — التحليل المالي (Exact 4 Blocks: Top 10 لك / Top 10 عليك / بدون حركة ولها رصيد / المسواة خلال الفترة) */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>4. التحليل المالي</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top 10 لك */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  أعلى 10 حسابات لك ({hierarchicalReport.financialAnalysis.top10Debtors.length})
                </h4>
                {hierarchicalReport.financialAnalysis.top10Debtors.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد أرصدة موجبة ضمن النطاق.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {hierarchicalReport.financialAnalysis.top10Debtors.map((d, i) => (
                      <div
                        key={d.account.id}
                        onClick={() => onSelectAccountForStatement?.(d.account.id)}
                        className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer hover:text-emerald-600"
                      >
                        <span className="truncate font-medium">{i + 1}. {d.account.name}</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {formatCurrency(d.directBalanceMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top 10 عليك */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  أعلى 10 حسابات عليك ({hierarchicalReport.financialAnalysis.top10Creditors.length})
                </h4>
                {hierarchicalReport.financialAnalysis.top10Creditors.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد التزامات عليك ضمن النطاق.</p>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {hierarchicalReport.financialAnalysis.top10Creditors.map((c, i) => (
                      <div
                        key={c.account.id}
                        onClick={() => onSelectAccountForStatement?.(c.account.id)}
                        className="flex items-center justify-between text-xs py-1 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer hover:text-rose-600"
                      >
                        <span className="truncate font-medium">{i + 1}. {c.account.name}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                          {formatCurrency(c.directBalanceMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* الحسابات بدون حركة ولكن لها رصيد */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  الحسابات بدون حركة ولها رصيد ({hierarchicalReport.financialAnalysis.zeroMovementAccounts.length})
                </h4>
                {hierarchicalReport.financialAnalysis.zeroMovementAccounts.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد حسابات حاملة لرصيد دون حركة خلال الفترة.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {hierarchicalReport.financialAnalysis.zeroMovementAccounts.map((r) => (
                      <div
                        key={r.account.id}
                        onClick={() => onSelectAccountForStatement?.(r.account.id)}
                        className="py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{r.account.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {r.lastTransactionDate ? `آخر حركة: ${r.lastTransactionDate}` : 'رصيد افتتاحي دون حركات'}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
                          {formatCurrency(r.directBalanceMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* الحسابات المسواة خلال الفترة (#14) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>الحسابات المسواة خلال الفترة — تحركت وأغلقت على صفر ({hierarchicalReport.financialAnalysis.settledAccounts.length})</span>
                </h4>
                {hierarchicalReport.financialAnalysis.settledAccounts.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد حسابات مسواة على الصفر خلال هذه الفترة.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {hierarchicalReport.financialAnalysis.settledAccounts.map((r) => (
                      <div
                        key={r.account.id}
                        onClick={() => onSelectAccountForStatement?.(r.account.id)}
                        className="py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate flex items-center gap-1.5">
                            <span>{r.account.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              تمت التسوية
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            أول الفترة: {formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol })} | حركة الفترة: {formatCurrency(r.directNetMovementMinor, { symbol: currencySymbol })} | {r.periodTransactionCount} حركة
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                          {formatCurrency(0, { symbol: currencySymbol })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 3: Category Aggregation Report (#19) */}
      {dateValidation.valid && subTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  تقرير التجميع والتوزيع حسب التصنيفات
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تجميع الأرصدة المباشرة للحسابات المشمولة ضمن النطاق المحدد بعد استبعاد الحسابات الصفرية الخاملة.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-600">
                {categoriesReport.rows.length} تصنيف ({categoriesReport.includedAccountsCount} حساب مشمول)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">اسم التصنيف</th>
                    <th className="py-3 px-4 text-center">عدد الحسابات المشمولة</th>
                    <th className="py-3 px-4">إجمالي لك (مدينون)</th>
                    <th className="py-3 px-4">إجمالي عليك (دائنون)</th>
                    <th className="py-3 px-4">صافي المركز المالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {categoriesReport.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        لا توجد تصنيفات بها حسابات ذات صلة ضمن هذا النطاق.
                      </td>
                    </tr>
                  ) : (
                    categoriesReport.rows.map((row) => (
                      <tr key={row.category.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">
                          {row.category.name}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-600 dark:text-slate-400">
                          {row.accountsCount}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.totalReceivableMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-rose-600 dark:text-rose-400">
                          {formatCurrency(row.totalPayableMinor, { symbol: currencySymbol })}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold">
                          <span
                            className={
                              row.netBalanceMinor > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.netBalanceMinor < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-400'
                            }
                          >
                            {formatCurrency(row.netBalanceMinor, { symbol: currencySymbol })}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="py-3.5 px-4">الإجمالي العام للتصنيفات</td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {categoriesReport.includedAccountsCount}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(categoriesReport.grandTotalReceivableMinor, { symbol: currencySymbol })}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-rose-600 dark:text-rose-400">
                      {formatCurrency(categoriesReport.grandTotalPayableMinor, { symbol: currencySymbol })}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-blue-600 dark:text-blue-400">
                      {formatCurrency(categoriesReport.grandNetBalanceMinor, { symbol: currencySymbol })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Period Summary Statement (#20) */}
      {dateValidation.valid && subTab === 'period' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 font-semibold">عدد الحركات</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                {periodReport.transactionsCount} حركة
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                أول الفترة: {formatCurrency(periodReport.openingBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">عليه</div>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(periodReport.totalOwedByMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
              <div className="text-xs text-rose-800 dark:text-rose-300 font-semibold">له</div>
              <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(periodReport.totalOwedToMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
              <div className="text-xs text-blue-800 dark:text-blue-300 font-semibold">صافي الحركة</div>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                {formatCurrency(periodReport.periodNetChangeMinor, { symbol: currencySymbol })}
              </div>
              <div className="text-[10px] text-blue-700 dark:text-blue-300 mt-0.5">
                الختامي: {formatCurrency(periodReport.closingBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                حركات الفترة المحددة ({periodReport.rows.length} من أصل {periodReport.transactionsCount} حركة)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">اسم الحساب</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">النوع</th>
                    <th className="py-3 px-4">البيان</th>
                    <th className="py-3 px-4">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {periodReport.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        لا توجد حركات مالية مسجلة تطابق خيارات التصفية.
                      </td>
                    </tr>
                  ) : (
                    periodReport.rows.map((row) => (
                      <tr key={row.transaction.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{row.transaction.date}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{row.accountName}</td>
                        <td className="py-3 px-4 text-slate-500">{row.categoryName}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.transaction.entryType === 'owedByAccount'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {row.transaction.entryType === 'owedByAccount' ? 'عليه' : 'له'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{row.transaction.description}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(row.transaction.amountMinor, { symbol: currencySymbol })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Debtors & Creditors Analysis (#21) */}
      {dateValidation.valid && subTab === 'debtors_creditors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Debtors List (لك) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>المدينون — حقوقك (لك)</span>
                  </h3>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    إجمالي: {formatCurrency(debtorsCreditorsReport.totalDebtorsMinor, { symbol: currencySymbol })} ({debtorsCreditorsReport.totalDebtorsCount} مدين)
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {debtorsCreditorsReport.debtors.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">لا يوجد مدينون بأرصدة موجبة ضمن النطاق.</div>
                ) : (
                  debtorsCreditorsReport.debtors.map((d) => (
                    <div
                      key={d.account.id}
                      onClick={() => onSelectAccountForStatement?.(d.account.id)}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between hover:border-emerald-400 transition-all cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{d.account.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{d.categoryName}</div>
                      </div>
                      <div className="text-left">
                        <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(d.balanceMinor, { symbol: currencySymbol })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          تركز: {d.sharePercentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Creditors List (عليك) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                    <span>الدائنون — التزاماتك (عليك)</span>
                  </h3>
                  <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                    إجمالي: {formatCurrency(debtorsCreditorsReport.totalCreditorsMinor, { symbol: currencySymbol })} ({debtorsCreditorsReport.totalCreditorsCount} دائن)
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {debtorsCreditorsReport.creditors.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">لا يوجد دائنون بأرصدة سالبة ضمن النطاق.</div>
                ) : (
                  debtorsCreditorsReport.creditors.map((c) => (
                    <div
                      key={c.account.id}
                      onClick={() => onSelectAccountForStatement?.(c.account.id)}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between hover:border-rose-400 transition-all cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{c.account.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{c.categoryName}</div>
                      </div>
                      <div className="text-left">
                        <div className="font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
                          {formatCurrency(c.absBalanceMinor, { symbol: currencySymbol })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          تركز: {c.sharePercentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
