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
      role="toolbar"
      dir="rtl"
      aria-label="التنقل السفلي للجوال"
      data-ui-effect="gradient-mobile-button-group"
      className="rakan-gradient-mobile-nav mobile-bottom-nav no-print fixed inset-x-0 bottom-0 z-30 lg:hidden backdrop-blur-xl"
    >
      <div className="grid grid-cols-6 gap-0.5 max-w-xl mx-auto px-1.5 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
        {links.map((item) => {
          const Icon = item.icon;
          const active = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              data-active={active}
              className="rakan-gradient-nav-item flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold"
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-full">{item.label}</span>
            </button>
          );
        })}
        <button type="button" onClick={toggleTheme}
          aria-label={settings.theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الزجاجي'}
          title={settings.theme === 'dark' ? 'الوضع النهاري' : 'الوضع الزجاجي'}
          data-active="false"
          className="rakan-gradient-nav-item flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold">
          {settings.theme === 'dark' ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
          <span>المظهر</span>
        </button>
        <button type="button" onClick={onOpenMore} aria-label="المزيد من عناصر القائمة"
          data-active="false"
          className="rakan-gradient-nav-item flex flex-col items-center justify-center gap-1 min-w-0 min-h-[53px] rounded-xl text-[10px] font-semibold">
          <Grid2X2 className="w-5 h-5" aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
};
