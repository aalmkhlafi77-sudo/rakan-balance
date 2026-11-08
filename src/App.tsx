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
import { FinancialReportsView } from './components/FinancialReportsView.tsx';
import { ImportView } from './components/ImportView.tsx';
import { NotesView } from './components/NotesView.tsx';
import { DuesView } from './components/DuesView.tsx';
import { BackupRestoreView } from './components/BackupRestoreView.tsx';
import { VerificationModal } from './components/VerificationModal.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { LockScreen } from './components/LockScreen.tsx';
import { QuickTransactionModal } from './components/QuickTransactionModal.tsx';
import { InterAccountTransferModal } from './components/InterAccountTransferModal.tsx';
import { FirstSetupModal } from './components/FirstSetupModal.tsx';
import { TransactionModel } from './domain/types.ts';

const AppContent: React.FC = () => {
  const { isLoading, isLocked } = useApp();

  const [currentTab, setCurrentTab] = useState<TabView>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Quick Transaction Modal State
  const [quickTxOpen, setQuickTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionModel | null>(null);
  const [quickTxAccountId, setQuickTxAccountId] = useState<string | undefined>(undefined);

  // Inter-Account Transfer Modal State (Milestone N1)
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSourceAccountId, setTransferSourceAccountId] = useState<string | undefined>(undefined);
  const [editingTransferId, setEditingTransferId] = useState<string | undefined>(undefined);

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

  const handleOpenTransfer = (sourceAccountId?: string) => {
    setEditingTransferId(undefined);
    setTransferSourceAccountId(sourceAccountId);
    setTransferModalOpen(true);
  };

  const handleEditTransfer = (transferId: string) => {
    setEditingTransferId(transferId);
    setTransferSourceAccountId(undefined);
    setTransferModalOpen(true);
  };

  const handleOpenStatementForAccount = (accountId: string) => {
    setStatementAccountId(accountId);
    setCurrentTab('statement');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-transparent flex flex-col items-center justify-center p-4 text-center" dir="rtl">
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
    <div className="min-h-screen bg-slate-50 dark:bg-transparent flex text-slate-900 dark:text-slate-100 selection:bg-[#B56CE8]/30" dir="rtl">
      {/* Local Lock Screen Overlay */}
      {isLocked && <LockScreen />}

      {/* First-time Onboarding & Setup Wizard */}
      <FirstSetupModal />

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
          onOpenInterAccountTransfer={() => handleOpenTransfer()}
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
              onOpenInterAccountTransfer={handleOpenTransfer}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsView
              onOpenQuickTx={handleOpenQuickTx}
              onEditTransaction={handleEditTx}
              onOpenStatementForAccount={handleOpenStatementForAccount}
              onOpenInterAccountTransfer={() => handleOpenTransfer()}
              onEditInterAccountTransfer={handleEditTransfer}
            />
          )}

          {currentTab === 'statement' && (
            <StatementView
              initialAccountId={statementAccountId}
              onEditTransaction={handleEditTx}
              onEditInterAccountTransfer={handleEditTransfer}
            />
          )}

          {currentTab === 'reports' && (
            <FinancialReportsView onSelectAccountForStatement={handleOpenStatementForAccount} />
          )}

          {currentTab === 'import' && <ImportView />}

          {currentTab === 'notes' && <NotesView />}
          {currentTab === 'dues' && <DuesView />}

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

      {/* Inter-Account Transfer Modal (Milestone N1) */}
      <InterAccountTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        initialSourceAccountId={transferSourceAccountId}
        initialTransferId={editingTransferId}
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
