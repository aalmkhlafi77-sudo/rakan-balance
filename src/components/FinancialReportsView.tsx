/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Financial Reports Dashboard Component
 * Renders analytical financial reports, metrics, date-range filters, and export options (PDF, Excel, Print).
 */

import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  generateAccountsBalanceReport,
  generateCategorySummaryReport,
  generateDebtorsCreditorsReport,
  generatePeriodSummaryReport,
  ReportFilterOptions,
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
import { generatePdfReport } from '../services/pdf_export.ts';
import {
  BarChart3,
  Calendar,
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
  ArrowUpDown,
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

  // Active Sub-Tab
  const [subTab, setSubTab] = useState<ReportSubTab>('accounts');

  // Filters State
  const [periodPreset, setPeriodPreset] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Handle Preset Changes
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

  // Compute Filter Options
  const filterOptions: ReportFilterOptions = useMemo(
    () => ({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      categoryId: selectedCategory,
      status: selectedStatus,
      searchQuery: searchQuery,
    }),
    [fromDate, toDate, selectedCategory, selectedStatus, searchQuery]
  );

  // 1. Accounts Balance Report Data
  const accountsReport = useMemo(
    () => generateAccountsBalanceReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  // 1b. Hierarchical Accounts Report Data (filtered by status, category, dates, search)
  const hierarchicalReport = useMemo(
    () => generateHierarchicalAccountsReport(accounts, transactions, categories, filterOptions),
    [accounts, transactions, categories, filterOptions]
  );

  const hierRowByAccountId = useMemo(
    () => new Map(hierarchicalReport.rows.map((r) => [r.account.id, r])),
    [hierarchicalReport.rows]
  );

  // 2. Category Summary Report Data
  const categoriesReport = useMemo(
    () => generateCategorySummaryReport(accounts, transactions, categories, toDate || undefined),
    [accounts, transactions, categories, toDate]
  );

  // 3. Period Summary Statement Data
  const periodReport = useMemo(
    () => generatePeriodSummaryReport(accounts, transactions, categories, fromDate, toDate),
    [accounts, transactions, categories, fromDate, toDate]
  );

  // 4. Debtors & Creditors Data
  const debtorsCreditorsReport = useMemo(
    () => generateDebtorsCreditorsReport(accounts, transactions, categories, toDate || undefined),
    [accounts, transactions, categories, toDate]
  );

  // Export Trigger: Excel
  const handleExportExcel = () => {
    if (subTab === 'accounts') {
      exportAccountsReportToExcel(
        accountsReport.rows,
        currencySymbol,
        {
          totalReceivable: accountsReport.totalReceivableMinor,
          totalPayable: accountsReport.totalPayableMinor,
          netBalance: accountsReport.netBalanceMinor,
        },
        {
          accounts,
          transactions,
          categories,
          currencyName: settings.currencyName,
          ownerName: settings.ownerName,
          filterOptions,
        }
      );
    } else if (subTab === 'hierarchical') {
      exportComprehensiveAccountsReportToExcel({
        accounts,
        transactions,
        categories,
        currencySymbol,
        currencyName: settings.currencyName,
        ownerName: settings.ownerName,
        filterOptions,
        reportTitle: 'تقرير الحسابات الرئيسية والفروع (الشجرة المالية)',
      });
    } else if (subTab === 'categories') {
      exportCategoriesReportToExcel(categoriesReport.rows, currencySymbol, {
        totalReceivable: categoriesReport.grandTotalReceivableMinor,
        totalPayable: categoriesReport.grandTotalPayableMinor,
        grandNet: categoriesReport.grandNetBalanceMinor,
      });
    } else if (subTab === 'period') {
      exportPeriodReportToExcel(periodReport.rows, currencySymbol, {
        fromDate,
        toDate,
        openingMinor: periodReport.openingBalanceMinor,
        closingMinor: periodReport.closingBalanceMinor,
      });
    } else if (subTab === 'debtors_creditors') {
      exportDebtorsCreditorsReportToExcel(
        debtorsCreditorsReport.debtors,
        debtorsCreditorsReport.creditors,
        currencySymbol
      );
    }
  };

  // Export Trigger: PDF / Print
  const handleExportPdfOrPrint = () => {
    if (subTab === 'accounts') {
      generatePdfReport({
        reportTitle: 'تقرير الأرصدة المالية الشامل',
        subtitle: `عدد الحسابات المعروضة: ${hierarchicalReport.rows.length}`,
        ownerName: settings.ownerName,
        currencySymbol,
        filterInfo: periodPreset !== 'all' || fromDate || toDate ? `الفترة: ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'جميع الحركات',
        metrics: [
          { title: 'إجمالي لك (مدينون)', value: formatCurrency(hierarchicalReport.totalDirectReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'إجمالي عليك (دائنون)', value: formatCurrency(hierarchicalReport.totalDirectPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
          { title: 'صافي المركز المالي', value: formatCurrency(hierarchicalReport.netDirectBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
          { title: 'عدد الحسابات', value: String(hierarchicalReport.rows.length), colorClass: 'slate' },
        ],
        columns: [
          { header: 'اسم الحساب', align: 'right' },
          { header: 'التصنيف', align: 'right' },
          { header: `رصيد أول الفترة (${currencySymbol})`, align: 'right' },
          { header: `عليه (${currencySymbol})`, align: 'right' },
          { header: `له (${currencySymbol})`, align: 'right' },
          { header: `صافي الحركة (${currencySymbol})`, align: 'right' },
          { header: `رصيد آخر الفترة (${currencySymbol})`, align: 'right' },
          { header: 'الحالة', align: 'center' },
        ],
        rows: hierarchicalReport.rows.map((r) => [
          r.hierarchicalPath || r.account.name,
          r.categoryName,
          formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol }),
          formatCurrency(r.directOwedByMinor, { symbol: currencySymbol }),
          formatCurrency(r.directOwedToMinor, { symbol: currencySymbol }),
          formatCurrency(r.directNetMovementMinor, { symbol: currencySymbol }),
          formatCurrency(r.directBalanceMinor, { symbol: currencySymbol }),
          r.directBalanceType === 'receivable' ? 'لك' : r.directBalanceType === 'payable' ? 'عليك' : 'متزن',
        ]),
      });
    } else if (subTab === 'hierarchical') {
      generatePdfReport({
        reportTitle: 'التقرير التنفيذي للحسابات الرئيسية والفروع',
        subtitle: `الحسابات الرئيسية: ${hierarchicalReport.rootAccountsCount} | الفرعية: ${hierarchicalReport.branchAccountsCount} | حركات الفترة: ${hierarchicalReport.periodOperations.transactionsCount}`,
        ownerName: settings.ownerName,
        currencySymbol,
        filterInfo: periodPreset !== 'all' || fromDate || toDate ? `الفترة: ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'جميع الحركات',
        metrics: [
          { title: 'إجمالي لك المباشر (بدون تكرار)', value: formatCurrency(hierarchicalReport.totalDirectReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'إجمالي عليك المباشر (بدون تكرار)', value: formatCurrency(hierarchicalReport.totalDirectPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
          { title: 'رصيد أول الفترة الإجمالي', value: formatCurrency(hierarchicalReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol }), colorClass: 'slate' },
          { title: 'رصيد آخر الفترة الإجمالي', value: formatCurrency(hierarchicalReport.totalClosingDirectBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
        ],
        columns: [
          { header: 'الحساب', align: 'right' },
          { header: 'الأب / التصنيف', align: 'right' },
          { header: `رصيد أول الفترة (${currencySymbol})`, align: 'right' },
          { header: `عليه (${currencySymbol})`, align: 'right' },
          { header: `له (${currencySymbol})`, align: 'right' },
          { header: `الرصيد المباشر (${currencySymbol})`, align: 'right' },
          { header: `رصيد التابعين (${currencySymbol})`, align: 'right' },
          { header: `الرصيد المجمع (${currencySymbol})`, align: 'right' },
          { header: 'الحالة', align: 'center' },
        ],
        rows: hierarchicalReport.rows.map((r) => [
          `${'— '.repeat(r.level)}${r.account.name}`,
          `${r.parentName || 'رئيسي'} · ${r.categoryName}`,
          formatCurrency(r.openingAtPeriodMinor, { symbol: currencySymbol }),
          formatCurrency(r.directOwedByMinor, { symbol: currencySymbol }),
          formatCurrency(r.directOwedToMinor, { symbol: currencySymbol }),
          formatCurrency(r.directBalanceMinor, { symbol: currencySymbol }),
          formatCurrency(r.consolidatedChildrenOnlyMinor, { symbol: currencySymbol }),
          formatCurrency(r.consolidatedBalanceMinor, { symbol: currencySymbol }),
          r.account.status === 'active' ? 'نشط' : 'مؤرشف',
        ]),
      });
    } else if (subTab === 'categories') {
      generatePdfReport({
        reportTitle: 'تقرير توزيع الأرصدة حسب التصنيفات',
        subtitle: `عدد التصنيفات: ${categoriesReport.rows.length}`,
        ownerName: settings.ownerName,
        currencySymbol,
        metrics: [
          { title: 'إجمالي لك بالتصنيفات', value: formatCurrency(categoriesReport.grandTotalReceivableMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'إجمالي عليك بالتصنيفات', value: formatCurrency(categoriesReport.grandTotalPayableMinor, { symbol: currencySymbol }), colorClass: 'rose' },
          { title: 'الصافي العام', value: formatCurrency(categoriesReport.grandNetBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
        ],
        columns: [
          { header: 'اسم التصنيف', align: 'right' },
          { header: 'عدد الحسابات النشطة', align: 'center' },
          { header: `إجمالي لك (${currencySymbol})`, align: 'right' },
          { header: `إجمالي عليك (${currencySymbol})`, align: 'right' },
          { header: `الصافي (${currencySymbol})`, align: 'right' },
        ],
        rows: categoriesReport.rows.map((r) => [
          r.category.name,
          r.accountsCount,
          formatCurrency(r.totalReceivableMinor, { symbol: currencySymbol }),
          formatCurrency(r.totalPayableMinor, { symbol: currencySymbol }),
          formatCurrency(r.netBalanceMinor, { symbol: currencySymbol }),
        ]),
      });
    } else if (subTab === 'period') {
      generatePdfReport({
        reportTitle: 'تقرير حركة الحسابات التفصيلي للفترة',
        subtitle: `الفترة من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}`,
        ownerName: settings.ownerName,
        currencySymbol,
        metrics: [
          { title: 'الرصيد الافتتاحي الإجمالي', value: formatCurrency(periodReport.openingBalanceMinor, { symbol: currencySymbol }), colorClass: 'slate' },
          { title: 'إجمالي عليه بالدورة', value: formatCurrency(periodReport.totalOwedByMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'إجمالي له بالدورة', value: formatCurrency(periodReport.totalOwedToMinor, { symbol: currencySymbol }), colorClass: 'rose' },
          { title: 'الرصيد الختامي الإجمالي', value: formatCurrency(periodReport.closingBalanceMinor, { symbol: currencySymbol }), colorClass: 'blue' },
        ],
        columns: [
          { header: 'التاريخ', align: 'center' },
          { header: 'الحساب', align: 'right' },
          { header: 'التصنيف', align: 'right' },
          { header: 'نوع الحركة', align: 'center' },
          { header: 'البيان', align: 'right' },
          { header: `المبلغ (${currencySymbol})`, align: 'right' },
        ],
        rows: periodReport.rows.map((r) => [
          r.transaction.date,
          r.accountName,
          r.categoryName,
          r.transaction.entryType === 'owedByAccount' ? 'عليه' : 'له',
          r.transaction.description,
          formatCurrency(r.transaction.amountMinor, { symbol: currencySymbol }),
        ]),
      });
    } else if (subTab === 'debtors_creditors') {
      generatePdfReport({
        reportTitle: 'تقرير تحليل الأطراف والتركز المالي (لك / عليك)',
        subtitle: `عدد المدينين: ${debtorsCreditorsReport.debtors.length} | عدد الدائنين: ${debtorsCreditorsReport.creditors.length}`,
        ownerName: settings.ownerName,
        currencySymbol,
        metrics: [
          { title: 'إجمالي حقوقك (لك)', value: formatCurrency(debtorsCreditorsReport.totalDebtorsMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'أعلى مدين', value: debtorsCreditorsReport.topDebtorName || 'لا يوجد', subtext: formatCurrency(debtorsCreditorsReport.topDebtorAmountMinor, { symbol: currencySymbol }), colorClass: 'emerald' },
          { title: 'إجمالي التزاماتك (عليك)', value: formatCurrency(debtorsCreditorsReport.totalCreditorsMinor, { symbol: currencySymbol }), colorClass: 'rose' },
          { title: 'أعلى دائن', value: debtorsCreditorsReport.topCreditorName || 'لا يوجد', subtext: formatCurrency(debtorsCreditorsReport.topCreditorAmountMinor, { symbol: currencySymbol }), colorClass: 'rose' },
        ],
        columns: [
          { header: 'اسم الحساب', align: 'right' },
          { header: 'التصنيف', align: 'right' },
          { header: 'النوع', align: 'center' },
          { header: `المبلغ (${currencySymbol})`, align: 'right' },
          { header: 'نسبة التركز', align: 'center' },
        ],
        rows: [
          ...debtorsCreditorsReport.debtors.map((d) => [
            d.account.name,
            d.categoryName,
            'مدين (لك)',
            formatCurrency(d.balanceMinor, { symbol: currencySymbol }),
            `${d.sharePercentage.toFixed(1)}%`,
          ]),
          ...debtorsCreditorsReport.creditors.map((c) => [
            c.account.name,
            c.categoryName,
            'دائن (عليك)',
            formatCurrency(c.absBalanceMinor, { symbol: currencySymbol }),
            `${c.sharePercentage.toFixed(1)}%`,
          ]),
        ],
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header & Main Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>التقارير المالية والتحليلية المتقدمة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إعداد التقارير الشاملة، تحليلات المركز المالي والتصنيفات، وتصدير PDF و Excel احترافي باللغة العربية.
          </p>
        </div>

        {/* Global Export Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportPdfOrPrint}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            title="طباعة أو حفظ بصيغة PDF"
          >
            <Printer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>طباعة / PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
            title="تصدير جدول اكسل Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير Excel</span>
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

      {/* Filter Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span>تصفية وخيارات التقرير</span>
          </div>
          {(fromDate || toDate || selectedCategory !== 'all' || selectedStatus !== 'active' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setPeriodPreset('all');
                setFromDate('');
                setToDate('');
                setSelectedCategory('all');
                setSelectedStatus('active');
                setSearchQuery('');
              }}
              className="text-[11px] text-rose-600 hover:underline cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Preset Period Buttons */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">الفترة الزمانية Presets</label>
            <select
              value={periodPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">جميع الحركات (شامل)</option>
              <option value="this_month">الشهر الحالي</option>
              <option value="last_month">الشهر السابق</option>
              <option value="this_quarter">الربع الحالي</option>
              <option value="this_year">السنة الحالية</option>
              <option value="custom">تاريخ مخصص...</option>
            </select>
          </div>

          {/* Date Range Inputs */}
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

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">بحث بالاسم أو الهاتف</label>
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث عن حساب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full py-2 pr-8 pl-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: Accounts Balance Report */}
      {subTab === 'accounts' && (
        <div className="space-y-5">
          {/* Executive Period Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
                <span>إجمالي لك (مدينون)</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(hierarchicalReport.totalDirectReceivableMinor, { symbol: currencySymbol })}
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1">
                مستحق لك طرف الآخرين: {hierarchicalReport.balancesSummary.receivableAccountsCount} حساب
              </div>
            </div>

            <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
              <div className="flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 font-semibold mb-1">
                <span>إجمالي عليك (دائنون)</span>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(hierarchicalReport.totalDirectPayableMinor, { symbol: currencySymbol })}
              </div>
              <div className="text-[10px] text-rose-700 dark:text-rose-400 mt-1">
                التزامات للغير عليك: {hierarchicalReport.balancesSummary.payableAccountsCount} حساب
              </div>
            </div>

            <div className="bg-blue-50/80 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
              <div className="flex items-center justify-between text-xs text-blue-800 dark:text-blue-300 font-semibold mb-1">
                <span>صافي المركز المالي</span>
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {formatCurrency(hierarchicalReport.netDirectBalanceMinor, { symbol: currencySymbol })}
              </div>
              <div className="text-[10px] text-blue-700 dark:text-blue-400 mt-1">
                أول الفترة: {formatCurrency(hierarchicalReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol })} | آخر الفترة: {formatCurrency(hierarchicalReport.totalClosingDirectBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 font-semibold mb-1">
                <span>حركة الفترة والحسابات</span>
                <UserCheck className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                {hierarchicalReport.totalAccountsCount} حساب ({hierarchicalReport.periodOperations.transactionsCount} حركة)
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                رئيسي: {hierarchicalReport.rootAccountsCount} | فرعي: {hierarchicalReport.branchAccountsCount} | متزن: {hierarchicalReport.balancesSummary.balancedAccountsCount}
              </div>
            </div>
          </div>

          {/* Accounts Data Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                جدول أرصدة الحسابات والأطراف
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {accountsReport.rows.length} حساب
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">اسم الحساب</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">رصيد أول الفترة</th>
                    <th className="py-3 px-4">عليه</th>
                    <th className="py-3 px-4">له</th>
                    <th className="py-3 px-4">صافي الحركة</th>
                    <th className="py-3 px-4">رصيد آخر الفترة</th>
                    <th className="py-3 px-4 text-center">النوع / الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {accountsReport.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        لا توجد حسابات تطابق خيارات التصفية المختارة.
                      </td>
                    </tr>
                  ) : (
                    accountsReport.rows.map((row) => {
                      const hRow = hierRowByAccountId.get(row.account.id);
                      const openingAtPeriod = hRow ? hRow.openingAtPeriodMinor : row.openingBalanceMinor;
                      return (
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
                            {hRow && hRow.hierarchicalPath !== row.account.name && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                {hRow.hierarchicalPath}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{row.categoryName}</td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {formatCurrency(openingAtPeriod, { symbol: currencySymbol })}
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
                                ? 'لك (مدين)'
                                : row.balanceType === 'payable'
                                ? 'عليك (دائن)'
                                : 'متزن'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 1b: Executive Hierarchical Accounts & Consolidated Branches Report */}
      {subTab === 'hierarchical' && (
        <div className="space-y-6">
          {/* SECTION 1: الملخص التنفيذي (Executive Summary) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>1. الملخص التنفيذي</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold">
                  إجمالي الحسابات: {hierarchicalReport.executiveSummary.accountsCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                  رئيسية: {hierarchicalReport.executiveSummary.rootAccountsCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-100/70 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold">
                  فرعية: {hierarchicalReport.executiveSummary.branchAccountsCount}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-100/70 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                  ذات حركة: {hierarchicalReport.executiveSummary.accountsWithActivityCount}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-emerald-50/80 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">إجمالي لك المباشر</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalDirectReceivableMinor, { symbol: currencySymbol })}
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">حقوق مباشرة دون تكرار</div>
              </div>

              <div className="bg-rose-50/80 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
                <div className="text-[11px] text-rose-800 dark:text-rose-300 font-semibold">إجمالي عليك المباشر</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalDirectPayableMinor, { symbol: currencySymbol })}
                </div>
                <div className="text-[10px] text-rose-700 dark:text-rose-400 mt-0.5">التزامات مباشرة دون تكرار</div>
              </div>

              <div className="bg-blue-50/80 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
                <div className="text-[11px] text-blue-800 dark:text-blue-300 font-semibold">صافي المركز المالي</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.netDirectBalanceMinor, { symbol: currencySymbol })}
                </div>
                <div className="text-[10px] text-blue-700 dark:text-blue-400 mt-0.5">المركز الحقيقي لجميع الحسابات</div>
              </div>

              <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <div className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">رصيد أول الفترة الإجمالي</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalOpeningAtPeriodMinor, { symbol: currencySymbol })}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">الافتتاحي + ما قبل الفترة</div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-medium">إجمالي حركة عليه للفترة</div>
                <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  +{formatMinorAmount(hierarchicalReport.totalPeriodOwedByMinor)} {currencySymbol}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-medium">إجمالي حركة له للفترة</div>
                <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                  -{formatMinorAmount(hierarchicalReport.totalPeriodOwedToMinor)} {currencySymbol}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 font-medium">صافي حركة الفترة</div>
                <div className="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(hierarchicalReport.totalPeriodNetMovementMinor, { symbol: currencySymbol })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-300 dark:border-slate-700">
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">رصيد آخر الفترة الإجمالي</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.totalClosingDirectBalanceMinor, { symbol: currencySymbol })}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: ملخص حركة الفترة (Period Operations Summary) */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>2. ملخص حركة الفترة</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">عدد الحركات</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-1">
                  {hierarchicalReport.periodOperations.transactionsCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">إجمالي عليه</div>
                <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(hierarchicalReport.periodOperations.totalOwedByMinor, { symbol: currencySymbol })}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">إجمالي له</div>
                <div className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 mt-1">
                  {formatCurrency(hierarchicalReport.periodOperations.totalOwedToMinor, { symbol: currencySymbol })}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">صافي حركة الفترة</div>
                <div className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(hierarchicalReport.periodOperations.periodNetChangeMinor, { symbol: currencySymbol })}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">أكبر حركة</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.periodOperations.largestTransactionMinor, { symbol: currencySymbol })}
                </div>
                {hierarchicalReport.periodOperations.largestTransactionAccountName && (
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {hierarchicalReport.periodOperations.largestTransactionAccountName}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[10px] text-slate-500">متوسط قيمة الحركة</div>
                <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(hierarchicalReport.periodOperations.averageTransactionMinor, { symbol: currencySymbol })}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  على {hierarchicalReport.periodOperations.accountsWithActivityCount} حساب
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: ملخص الأرصدة الحالية (Current Balances Summary + Top 5) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-emerald-600" />
                <span>3. ملخص الأرصدة الحالية</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold">
                  المستحقة لك: {hierarchicalReport.balancesSummary.receivableAccountsCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-semibold">
                  المستحقة عليك: {hierarchicalReport.balancesSummary.payableAccountsCount}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  المتزنة: {hierarchicalReport.balancesSummary.balancedAccountsCount}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top 5 Receivable */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">أعلى 5 حسابات لك</h4>
                {hierarchicalReport.balancesSummary.top5Debtors.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد أرصدة موجبة.</p>
                ) : (
                  hierarchicalReport.balancesSummary.top5Debtors.map((r, i) => (
                    <div
                      key={r.account.id}
                      onClick={() => onSelectAccountForStatement?.(r.account.id)}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer hover:text-emerald-600"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{i + 1}. {r.account.name}</div>
                        {r.hierarchicalPath !== r.account.name && (
                          <div className="text-[10px] text-slate-400 truncate">{r.hierarchicalPath}</div>
                        )}
                      </div>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        {formatCurrency(r.directBalanceMinor, { symbol: currencySymbol })}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Top 5 Payable */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                <h4 className="text-xs font-bold text-rose-700 dark:text-rose-300">أعلى 5 حسابات عليك</h4>
                {hierarchicalReport.balancesSummary.top5Creditors.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد التزامات عليك.</p>
                ) : (
                  hierarchicalReport.balancesSummary.top5Creditors.map((r, i) => (
                    <div
                      key={r.account.id}
                      onClick={() => onSelectAccountForStatement?.(r.account.id)}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer hover:text-rose-600"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{i + 1}. {r.account.name}</div>
                        {r.hierarchicalPath !== r.account.name && (
                          <div className="text-[10px] text-slate-400 truncate">{r.hierarchicalPath}</div>
                        )}
                      </div>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                        {formatCurrency(r.directBalanceMinor, { symbol: currencySymbol })}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Top 5 Root Accounts by Consolidated */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                <h4 className="text-xs font-bold text-amber-700 dark:text-amber-300">أعلى 5 حسابات رئيسية بالرصيد المجمع</h4>
                {hierarchicalReport.balancesSummary.top5RootsByConsolidated.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد حسابات رئيسية.</p>
                ) : (
                  hierarchicalReport.balancesSummary.top5RootsByConsolidated.map((r, i) => (
                    <div
                      key={r.account.id}
                      onClick={() => onSelectAccountForStatement?.(r.account.id)}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800 cursor-pointer hover:text-amber-600"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{i + 1}. {r.account.name}</div>
                        <div className="text-[10px] text-slate-400">{r.descendantCount} فرع وتابع</div>
                      </div>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          r.consolidatedBalanceMinor > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : r.consolidatedBalanceMinor < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatCurrency(r.consolidatedBalanceMinor, { symbol: currencySymbol })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* SECTION 4: ملخص الحسابات الرئيسية (Root Accounts Summary) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-600" />
                <span>4. ملخص الحسابات الرئيسية ({hierarchicalReport.rootSummaries.length})</span>
              </h3>
            </div>
            {hierarchicalReport.rootSummaries.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                لا توجد حسابات رئيسية ضمن الفلتر المحدد.
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
                          {root.categoryName} · {root.directChildrenCount} فرع مباشر ({root.descendantCount} تابع)
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
                        <span className="text-slate-400 block">عليه بالفترة</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatMinorAmount(root.consolidatedOwedByMinor)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">له بالفترة</span>
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
                      <div>
                        <span className="text-slate-400 block">الرصيد المباشر</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {formatCurrency(root.directBalanceMinor, { symbol: currencySymbol })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">الختامي المجمع</span>
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

          {/* SECTION 5: التحليل المالي (Financial Analysis) */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>5. التحليل المالي والحسابات بدون حركة</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Zero-Movement Accounts */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    حسابات بدون حركة خلال الفترة ({hierarchicalReport.financialAnalysis.zeroMovementAccounts.length})
                  </h4>
                </div>
                {hierarchicalReport.financialAnalysis.zeroMovementAccounts.length === 0 ? (
                  <p className="text-[11px] text-slate-400">جميع الحسابات المعروضة سجلت حركة في الفترة.</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {hierarchicalReport.financialAnalysis.zeroMovementAccounts.slice(0, 15).map((r) => (
                      <div
                        key={r.account.id}
                        onClick={() => onSelectAccountForStatement?.(r.account.id)}
                        className="py-2 flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{r.account.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {r.lastTransactionDate ? `آخر حركة: ${r.lastTransactionDate}` : 'لا توجد حركات مسبقة'}
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

              {/* Top 10 Concentration Overview */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ملخص أعلى 10 مدينين ودائنين ونطاق الحساب
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                      Top 10 مدينون ({hierarchicalReport.financialAnalysis.top10Debtors.length})
                    </div>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {hierarchicalReport.financialAnalysis.top10Debtors.map((d, i) => (
                        <div key={d.account.id} className="flex items-center justify-between text-[11px] gap-1">
                          <span className="truncate">{i + 1}. {d.account.name}</span>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            {formatMinorAmount(d.directBalanceMinor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 mb-1">
                      Top 10 دائنون ({hierarchicalReport.financialAnalysis.top10Creditors.length})
                    </div>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {hierarchicalReport.financialAnalysis.top10Creditors.map((c, i) => (
                        <div key={c.account.id} className="flex items-center justify-between text-[11px] gap-1">
                          <span className="truncate">{i + 1}. {c.account.name}</span>
                          <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                            {formatMinorAmount(c.directBalanceMinor)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 6: الجدول التفصيلي (Detailed Report Table) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  6. الجدول التفصيلي للحسابات والشجرة المالية
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  المعادلة المعتمدة لكل صف: رصيد أول الفترة + عليه - له = الرصيد المباشر | عرض تحليلي: الرصيد المباشر + رصيد التابعين = الرصيد المجمع.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {hierarchicalReport.rows.length} حساب
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">الحساب</th>
                    <th className="py-3 px-3">التصنيف</th>
                    <th className="py-3 px-3 text-center">المستوى</th>
                    <th className="py-3 px-3">الحساب الأب</th>
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
                      <td colSpan={12} className="py-8 text-center text-slate-400">
                        لا توجد حسابات تطابق خيارات التصفية المختارة.
                      </td>
                    </tr>
                  ) : (
                    hierarchicalReport.rows.map((row) => (
                      <tr
                        key={row.account.id}
                        onClick={() => onSelectAccountForStatement?.(row.account.id)}
                        className={`cursor-pointer transition-colors ${
                          row.isParent
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
                              {row.account.status === 'archived' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  مؤرشف
                                </span>
                              )}
                            </div>
                            {row.hierarchicalPath !== row.account.name && (
                              <span className="text-[10px] font-normal text-slate-400 mt-0.5">
                                {row.hierarchicalPath}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{row.categoryName}</td>
                        <td className="py-3 px-3 text-center font-mono text-slate-500">{row.level}</td>
                        <td className="py-3 px-3 text-slate-500">{row.parentName || '—'}</td>
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
                {hierarchicalReport.rows.length > 0 && (
                  <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td className="py-3 px-4" colSpan={4}>
                        الإجمالي المباشر (بدون تكرار للأب والفروع) — {hierarchicalReport.rows.length} حساب
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
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Category Aggregation Report */}
      {subTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  تقرير التجميع والتوزيع حسب التصنيفات
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تجميع الأرصدة المباشرة للحسابات النشطة دون تكرار أو تداخل بين الحسابات الرئيسية والفرعية.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-600">
                {categoriesReport.rows.length} تصنيف
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">اسم التصنيف</th>
                    <th className="py-3 px-4 text-center">عدد الحسابات</th>
                    <th className="py-3 px-4">إجمالي لك (مدينون)</th>
                    <th className="py-3 px-4">إجمالي عليك (دائنون)</th>
                    <th className="py-3 px-4">صافي المركز المالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {categoriesReport.rows.map((row) => (
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
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="py-3.5 px-4">الإجمالي العام لجميع التصنيفات</td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {categoriesReport.rows.reduce((s, r) => s + r.accountsCount, 0)}
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

      {/* SUB-TAB 3: Period Summary Statement */}
      {subTab === 'period' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div className="text-xs text-slate-500 font-semibold">الرصيد الافتتاحي السابق</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 mt-1">
                {formatCurrency(periodReport.openingBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
              <div className="text-xs text-emerald-800 dark:text-emerald-300 font-semibold">إجمالي عليه بالفترة</div>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                {formatCurrency(periodReport.totalOwedByMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/40 p-4 rounded-2xl border border-rose-200 dark:border-rose-800/60">
              <div className="text-xs text-rose-800 dark:text-rose-300 font-semibold">إجمالي له بالفترة</div>
              <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
                {formatCurrency(periodReport.totalOwedToMinor, { symbol: currencySymbol })}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60">
              <div className="text-xs text-blue-800 dark:text-blue-300 font-semibold">الرصيد الختامي الإجمالي</div>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                {formatCurrency(periodReport.closingBalanceMinor, { symbol: currencySymbol })}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                حركات الفترة الزمانية المحدد ({periodReport.rows.length} حركة)
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
                        لا توجد حركات مالية مسجلة خلال هذه الفترة.
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

      {/* SUB-TAB 4: Debtors & Creditors Analysis */}
      {subTab === 'debtors_creditors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Debtors List (المدينون - لك) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>المدينون — حقوقك (لك)</span>
                  </h3>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    إجمالي: {formatCurrency(debtorsCreditorsReport.totalDebtorsMinor, { symbol: currencySymbol })} ({debtorsCreditorsReport.debtors.length} مدين)
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {debtorsCreditorsReport.debtors.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">لا يوجد مدينون حالياً.</div>
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

            {/* Creditors List (الدائنون - عليك) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rose-200 dark:border-rose-800/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                    <span>الدائنون — التزاماتك (عليك)</span>
                  </h3>
                  <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                    إجمالي: {formatCurrency(debtorsCreditorsReport.totalCreditorsMinor, { symbol: currencySymbol })} ({debtorsCreditorsReport.creditors.length} دائن)
                  </p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {debtorsCreditorsReport.creditors.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">لا يوجد دائنون حالياً.</div>
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
