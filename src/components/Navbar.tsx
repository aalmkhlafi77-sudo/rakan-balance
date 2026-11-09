/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Top Navbar Component
 */

import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import { Menu, PlusCircle, AlertCircle, ArrowLeftRight, LogOut } from 'lucide-react';
import { TabView } from './Sidebar.tsx';
import { useOwnerAccess } from './OwnerAccessGate.tsx';

interface NavbarProps {
  currentTab: TabView;
  onOpenMobileSidebar: () => void;
  onOpenQuickTransaction: () => void;
  onOpenInterAccountTransfer?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onOpenMobileSidebar,
  onOpenQuickTransaction,
  onOpenInterAccountTransfer,
}) => {
  const { settings, activeScope, switchScope, returnToWelcomeScreen } = useApp();
  const ownerAccess = useOwnerAccess();

  const tabTitles: Record<TabView, string> = {
    dashboard: 'لوحة التحكم المالية',
    accounts: 'دليل الحسابات والأطراف',
    transactions: 'دفتر الحركات والعمليات',
    statement: 'كشف الحساب والتطابق التفصيلي',
    reports: 'التقارير المالية والتحليلات والتصدير الاحترافي',
    import: 'استيراد الحسابات والحركات (CSV / Excel)',
    notes: 'الملاحظات والمذكرات المستقلة',
    dues: 'الاستحقاقات والسداد والتذكيرات',
    backup: 'النسخ الاحتياطي والاستعادة الآمنة',
    tests: 'فحص القواعد والمعادلات المالية (N0 Tests)',
    settings: 'الإعدادات العامة',
  };

  return (
    <header className="luxury-navbar sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800" dir="rtl">
      {/* Demo Mode Persistent Alert Ribbon (if active) */}
      {import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true' && activeScope === 'demo' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-medium">
              أنت الآن في <strong>وضع المعاينة التجريبية</strong>. البيانات المعروضة تجريبية ومعزولة تماماً في مخزن مستقل، ولا تؤثر على بياناتك الحقيقية.
            </span>
          </div>
          <button
            type="button"
            onClick={() => switchScope('real')}
            className="text-[11px] underline font-semibold hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>العودة للبيانات الحقيقية</span>
          </button>
        </div>
      )}

      <div className="h-16 px-4 lg:px-8 flex items-center justify-between">
        {/* Left: Mobile Toggle & Breadcrumb Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="القائمة الرئيسية"
          >
            <Menu className="w-5 h-5" />
          </button>

          <img src="/assets/rakan-icon-192.webp" alt="" aria-hidden="true"
            className="lg:hidden w-8 h-8 shrink-0 rounded-lg object-contain"
            width={32} height={32} decoding="async" />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
              {tabTitles[currentTab]}
            </h1>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              المالك: <span className="font-medium text-slate-700 dark:text-slate-300">{settings.ownerName}</span> · العملة: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{settings.currencyCode}</span>
            </p>
          </div>
        </div>

        {/* Right: Quick Action Buttons & Guest exit */}
        <div className="flex items-center gap-2">
          {ownerAccess.status !== 'owner' && (
            <button
              type="button"
              onClick={returnToWelcomeScreen}
              title="العودة إلى شاشة البداية"
              className="hidden sm:flex py-1.5 px-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium items-center gap-1.5 transition-all cursor-pointer shadow-xs active:translate-y-0.5"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>شاشة البداية</span>
            </button>
          )}
          {onOpenInterAccountTransfer && (
            <button
              type="button"
              onClick={onOpenInterAccountTransfer}
              data-ui-effect="synthwave-laser-transfer"
              className="rakan-laser-button py-2 px-3 rounded-xl font-medium text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="relative z-10 w-4 h-4" />
              <span className="relative z-10 hidden sm:inline">حركة بينية</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenQuickTransaction}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-xs flex items-center gap-2 transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">تسجيل حركة جديدة</span>
            <span className="sm:hidden">حركة</span>
          </button>
        </div>
      </div>
    </header>
  );
};
