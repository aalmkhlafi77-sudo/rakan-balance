/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Responsive RTL Navigation Sidebar
 */

import React from 'react';
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
  FlaskConical,
  Shield,
  Layers,
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
    activeScope,
    switchScope,
    lockApp,
    hasPinSet,
    toggleTheme,
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
    { id: 'settings' as TabView, label: 'الإعدادات ومواصفات Dart', icon: Settings },
  ];

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

        {/* Workspace Scope Switcher (Real vs Isolated Demo) */}
        <div className="p-3 mx-3 my-2.5 rounded-xl border transition-colors bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>مساحة البيانات</span>
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                activeScope === 'demo'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              }`}
            >
              {activeScope === 'demo' ? 'تجريبي معزول' : 'حقيقي محلي'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-200 dark:bg-slate-900 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => switchScope('real')}
              className={`py-1 rounded-md font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeScope === 'real'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              <span>البيانات الحقيقية</span>
            </button>
            <button
              type="button"
              onClick={() => switchScope('demo')}
              className={`py-1 rounded-md font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                activeScope === 'demo'
                  ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <FlaskConical className="w-3 h-3 text-amber-500" />
              <span>بيانات المعاينة</span>
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {navItems.filter((item) => ownerAccess.status !== 'owner' || !['tests'].includes(item.id)).map((item) => {
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

        {/* Footer Actions: Owner login (server auth), Currency, Theme & Lock */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {ownerAccess.status === 'owner' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 text-center">مساحة المالك الخاصة</p>
              <button type="button" onClick={() => void ownerAccess.logout()} aria-label="تسجيل خروج المالك"
                className="w-full min-h-10 rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 text-xs font-bold">
                تسجيل الخروج
              </button>
            </div>
          )}
          {ownerAccess.status === 'visitor' && (
            <button type="button" onClick={ownerAccess.openLogin} aria-label="دخول المالك الخاص"
              className="w-full min-h-10 rounded-xl border border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
              دخول المالك الخاص
            </button>
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
