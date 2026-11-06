/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Main Application Root
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Sidebar, TabView } from './components/Sidebar.tsx';
import { Navbar } from './components/Navbar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { AccountsView } from './components/AccountsView.tsx';
import { TransactionsView } from './components/TransactionsView.tsx';
import { StatementView } from './components/StatementView.tsx';
import { NotesView } from './components/NotesView.tsx';
import { BackupRestoreView } from './components/BackupRestoreView.tsx';
import { VerificationModal } from './components/VerificationModal.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { QuickTransactionModal } from './components/QuickTransactionModal.tsx';
import { TransactionModel } from './domain/types.ts';

const AppContent: React.FC = () => {
  const { isLoading, isLocked } = useApp();

  const [currentTab, setCurrentTab] = useState<TabView>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Quick Transaction Modal State
  const [quickTxOpen, setQuickTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionModel | null>(null);
  const [quickTxAccountId, setQuickTxAccountId] = useState<string | undefined>(undefined);

  // Pre-selected account for statement tab
  const [statementAccountId, setStatementAccountId] = useState<string | undefined>(undefined);

  const handleOpenQuickTx = (accountId?: string) => {
    setEditingTx(null);
    setQuickTxAccountId(accountId);
    setQuickTxOpen(true);
  };

  const handleEditTx = (tx: TransactionModel) => {
    setEditingTx(tx);
    setQuickTxAccountId(tx.accountId);
    setQuickTxOpen(true);
  };

  const handleOpenStatementForAccount = (accountId: string) => {
    setStatementAccountId(accountId);
    setCurrentTab('statement');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center" dir="rtl">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-600/30 animate-pulse mb-3">
          ر
        </div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
          راكان بلانس | RAKAN BALANCE
        </div>
        <div className="text-xs text-slate-400 mt-1">جاري تحميل بيانات الذمم المالية...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex text-slate-900 dark:text-slate-100 selection:bg-emerald-500/20" dir="rtl">
      {/* Local Lock Screen Overlay */}
      {isLocked && <LockScreen />}

      {/* Main Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenQuickTransaction={() => handleOpenQuickTx()}
        />

        {/* Viewport Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigateTab={setCurrentTab}
              onOpenQuickTx={handleOpenQuickTx}
              onSelectAccountForStatement={handleOpenStatementForAccount}
            />
          )}

          {currentTab === 'accounts' && (
            <AccountsView
              onOpenStatementForAccount={handleOpenStatementForAccount}
              onOpenQuickTx={handleOpenQuickTx}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsView
              onOpenQuickTx={handleOpenQuickTx}
              onEditTransaction={handleEditTx}
              onOpenStatementForAccount={handleOpenStatementForAccount}
            />
          )}

          {currentTab === 'statement' && (
            <StatementView initialAccountId={statementAccountId} />
          )}

          {currentTab === 'notes' && <NotesView />}

          {currentTab === 'backup' && <BackupRestoreView />}

          {currentTab === 'tests' && <VerificationModal />}

          {currentTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Universal Quick Transaction Entry / Edit Modal */}
      <QuickTransactionModal
        isOpen={quickTxOpen}
        onClose={() => setQuickTxOpen(false)}
        editingTransaction={editingTx}
        defaultAccountId={quickTxAccountId}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
