/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Responsive RTL Navigation Sidebar
 */

import React from 'react';

const DevPreviewSwitcher = (import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true')
  ? React.lazy(() => import('./DevPreviewSwitcher.tsx').then((m) => ({ default: m.DevPreviewSwitcher })))
  : null;
import { useApp } from '../context/AppContext.tsx';
import { useOwnerAccess } from './OwnerAccessGate.tsx';
import {
  LayoutDashboard,
  Users,
  ReceiptText,
  FileSpreadsheet,
  BarChart3,
  FileUp,
  StickyNote,
  CalendarClock,
  HardDriveDownload,
  CheckCircle2,
  Settings,
  Lock,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';

export type TabView =
  | 'dashboard'
  | 'accounts'
  | 'transactions'
  | 'statement'
  | 'reports'
  | 'import'
  | 'notes'
  | 'dues'
  | 'backup'
  | 'tests'
  | 'settings';

interface SidebarProps {
  currentTab: TabView;
  onSelectTab: (tab: TabView) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const ownerAccess = useOwnerAccess();
  const {
    settings,
    lockApp,
    hasPinSet,
    toggleTheme,
    returnToWelcomeScreen,
  } = useApp();

  const navItems = [
    { id: 'dashboard' as TabView, label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'accounts' as TabView, label: 'دليل الحسابات', icon: Users },
    { id: 'transactions' as TabView, label: 'دفتر الحركات', icon: ReceiptText },
    { id: 'statement' as TabView, label: 'كشف الحساب التفصيلي', icon: FileSpreadsheet },
    { id: 'reports' as TabView, label: 'التقارير التحليلية والتصدير', icon: BarChart3 },
    { id: 'import' as TabView, label: 'استيراد (CSV / Excel)', icon: FileUp },
    { id: 'notes' as TabView, label: 'الملاحظات', icon: StickyNote },
    { id: 'dues' as TabView, label: 'الاستحقاقات والتذكيرات', icon: CalendarClock },
    { id: 'backup' as TabView, label: 'النسخ والاستعادة', icon: HardDriveDownload },
    { id: 'tests' as TabView, label: 'فحص القواعد المالية', icon: CheckCircle2 },
    { id: 'settings' as TabView, label: 'الإعدادات العامة', icon: Settings },
  ];

  const visibleNavItems = navItems.filter((item) => {
    // Hide developer/test-runner tab from guest mode
    if (item.id === 'tests' && ownerAccess.status !== 'owner') {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`luxury-sidebar fixed lg:sticky top-0 right-0 z-40 h-screen w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        dir="rtl"
      >
        {/* Approved logo: full artwork, transparent, no frame or decorative padding. */}
        <div className="min-h-[88px] px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0">
          <img
            src="/assets/rakan-logo.webp"
            alt="راكان بلانس — RAKAN BALANCE"
            className="block w-full max-w-[222px] h-[76px] object-contain object-center"
            width={920}
            height={320}
            loading="eager"
            decoding="async"
          />
        </div>

        {ownerAccess.status !== 'owner' && DevPreviewSwitcher && (
          <React.Suspense fallback={null}>
            <DevPreviewSwitcher />
          </React.Suspense>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Actions: Owner login (server auth), Currency, Theme & Lock, Guest Exit */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {ownerAccess.status === 'owner' ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 text-center">مساحة المالك الخاصة</p>
              <button type="button" onClick={() => void ownerAccess.logout()} aria-label="تسجيل خروج المالك"
                className="w-full min-h-9 rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold transition-colors cursor-pointer">
                تسجيل الخروج
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <button type="button" onClick={ownerAccess.openLogin} aria-label="دخول المالك الخاص"
                className="w-full min-h-9 rounded-xl border border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-xs font-bold transition-colors cursor-pointer">
                دخول المالك الخاص
              </button>
              <button
                type="button"
                onClick={returnToWelcomeScreen}
                aria-label="العودة إلى شاشة البداية"
                title="العودة إلى شاشة البداية دون حذف أي بيانات مسجلة"
                className="w-full min-h-8 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:translate-y-0.5"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>العودة إلى شاشة البداية</span>
              </button>
            </div>
          )}

          {/* Currency locked info */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/40">
            <span>العملة الموحدة</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
              {settings.currencyCode} ({settings.currencySymbol})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex-1 py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="تبديل المظهر"
            >
              {settings.theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>النهاري</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-[#B56CE8]" />
                  <span>الوضع الزجاجي</span>
                </>
              )}
            </button>

            {hasPinSet && (
              <button
                type="button"
                onClick={lockApp}
                className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="قفل التطبيق الآن"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>قفل</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

