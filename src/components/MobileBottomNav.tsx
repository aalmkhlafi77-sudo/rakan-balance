/**
 * RAKAN BALANCE — mobile-only bottom navigation.
 * All state is controlled by AppContent; all remaining tabs are available
 * through the existing accessible sidebar ("المزيد").
 */
import React from 'react';
import { LayoutDashboard, Users, ReceiptText, FileSpreadsheet, Grid2X2, Sun, Moon } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { TabView } from './Sidebar.tsx';

interface MobileBottomNavProps {
  currentTab: TabView;
  onSelectTab: (tab: TabView) => void;
  onOpenMore: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab, onSelectTab, onOpenMore,
}) => {
  const { settings, toggleTheme } = useApp();
  const links = [
    { id: 'dashboard' as const, label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'accounts' as const, label: 'الحسابات', icon: Users },
    { id: 'transactions' as const, label: 'الحركات', icon: ReceiptText },
    { id: 'statement' as const, label: 'كشف حساب', icon: FileSpreadsheet },
  ];
  return (
    <nav
      dir="rtl"
      aria-label="التنقل السفلي للجوال"
      className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 lg:hidden border-t border-slate-200 dark:border-amber-200/20 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
    >
      <div className="grid grid-cols-6 max-w-xl mx-auto px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        {links.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold transition-colors ${active
                ? 'text-emerald-700 dark:text-amber-200 bg-emerald-50 dark:bg-white/10'
                : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
        <button type="button" onClick={toggleTheme}
          aria-label={settings.theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الزجاجي'}
          title={settings.theme === 'dark' ? 'الوضع النهاري' : 'الوضع الزجاجي'}
          className="flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold text-slate-600 dark:text-amber-200 hover:bg-slate-100 dark:hover:bg-slate-800">
          {settings.theme === 'dark' ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
          <span>المظهر</span>
        </button>
        <button type="button" onClick={onOpenMore} aria-label="المزيد من عناصر القائمة"
          className="flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Grid2X2 className="w-5 h-5" aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
};
