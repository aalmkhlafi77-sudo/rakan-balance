/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Core Application Context
 * Single source of truth for accounts, transactions, categories, notes, lock, and workspace scopes.
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  AccountModel,
  AttachmentModel,
  BackupBundle,
  CategoryModel,
  StickyNoteModel,
  TransactionModel,
  UserSettings,
} from '../domain/types.ts';
import {
  calculateAccountBalance,
  calculateDashboardSummary,
  checkTreeCycle,
} from '../domain/balance_calculator.ts';
import { dbStorage, STORES_DEMO, STORES_REAL } from '../storage/indexed_db.ts';
import {
  getActiveScopePref,
  getOwnerNamePref,
  getPinAuthPref,
  getSidebarCollapsedPref,
  getThemePref,
  setActiveScopePref,
  setOwnerNamePref,
  setPinAuthPref,
  setSidebarCollapsedPref,
  setThemePref,
} from '../storage/local_storage.ts';
import {
  DEMO_ACCOUNTS,
  DEMO_NOTES,
  DEMO_TRANSACTIONS,
  INITIAL_CATEGORIES,
} from '../storage/initial_data.ts';
import { computeSHA256 } from '../storage/backup_service.ts';

interface AppContextType {
  // Data
  accounts: AccountModel[];
  categories: CategoryModel[];
  transactions: TransactionModel[];
  attachments: AttachmentModel[];
  notes: StickyNoteModel[];
  settings: UserSettings;
  isLoading: boolean;
  activeScope: 'real' | 'demo';

  // Derived Dashboard summary
  dashboardSummary: ReturnType<typeof calculateDashboardSummary>;
  getAccountBalance: (accountId: string) => number;

  // Account actions
  addAccount: (accountData: Omit<AccountModel, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>) => Promise<string>;
  updateAccount: (account: AccountModel) => Promise<void>;
  archiveAccount: (accountId: string) => Promise<void>;
  unarchiveAccount: (accountId: string) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;

  // Transaction actions
  addTransaction: (txData: Omit<TransactionModel, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>, newAttachments?: AttachmentModel[]) => Promise<string>;
  updateTransaction: (tx: TransactionModel, newAttachments?: AttachmentModel[], removedAttachmentIds?: string[]) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;

  // Category actions
  addCategory: (name: string) => Promise<void>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Notes actions
  addNote: (note: Omit<StickyNoteModel, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateNote: (note: StickyNoteModel) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  toggleArchiveNote: (id: string) => Promise<void>;

  // Workspace actions
  switchScope: (scope: 'real' | 'demo') => void;
  loadDemoData: () => Promise<void>;
  purgeDemoData: () => Promise<void>;
  atomicRestoreData: (bundleData: BackupBundle['data']) => Promise<void>;
  rollbackLastRestore: () => Promise<boolean>;

  // App lock & Security
  isLocked: boolean;
  hasPinSet: boolean;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockApp: () => void;
  setupPin: (newPin: string) => Promise<void>;
  removePin: (currentPin: string) => Promise<boolean>;

  // Display Settings
  toggleTheme: () => void;
  toggleSidebar: () => void;
  updateOwnerName: (name: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<'real' | 'demo'>(getActiveScopePref());

  // In-memory active stores
  const [accounts, setAccounts] = useState<AccountModel[]>([]);
  const [categories, setCategories] = useState<CategoryModel[]>([]);
  const [transactions, setTransactions] = useState<TransactionModel[]>([]);
  const [attachments, setAttachments] = useState<AttachmentModel[]>([]);
  const [notes, setNotes] = useState<StickyNoteModel[]>([]);

  // Settings & Security
  const [theme, setTheme] = useState<'dark' | 'light'>(getThemePref());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSidebarCollapsedPref());
  const [ownerName, setOwnerName] = useState<string>(getOwnerNamePref());
  const pinAuth = getPinAuthPref();
  const [isLocked, setIsLocked] = useState<boolean>(Boolean(pinAuth.hash));

  // Initialize theme on DOM
  useEffect(() => {
    setThemePref(theme);
  }, [theme]);

  // Load workspace data based on active scope
  const loadWorkspaceData = useCallback(async (scope: 'real' | 'demo') => {
    setIsLoading(true);
    try {
      if (scope === 'demo') {
        let [demoAccs, demoCats, demoTxs] = await Promise.all([
          dbStorage.getAll<AccountModel>(STORES_DEMO.ACCOUNTS),
          dbStorage.getAll<CategoryModel>(STORES_DEMO.CATEGORIES),
          dbStorage.getAll<TransactionModel>(STORES_DEMO.TRANSACTIONS),
        ]);

        // Auto-seed demo workspace if empty
        if (!demoAccs || demoAccs.length === 0) {
          await dbStorage.saveDemoWorkspace(DEMO_ACCOUNTS, INITIAL_CATEGORIES, DEMO_TRANSACTIONS);
          demoAccs = DEMO_ACCOUNTS;
          demoCats = INITIAL_CATEGORIES;
          demoTxs = DEMO_TRANSACTIONS;
        }

        setAccounts(demoAccs);
        setCategories(demoCats);
        setTransactions(demoTxs);
        setAttachments([]);
        setNotes(DEMO_NOTES);
      } else {
        // Real Workspace
        const [realAccs, realCats, realTxs, realAtts, realNotes] = await Promise.all([
          dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
          dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
          dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
          dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
          dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
        ]);

        // Ensure default categories exist if completely empty
        if (!realCats || realCats.length === 0) {
          for (const cat of INITIAL_CATEGORIES) {
            await dbStorage.put(STORES_REAL.CATEGORIES, cat);
          }
          setCategories(INITIAL_CATEGORIES);
        } else {
          setCategories(realCats);
        }

        setAccounts(realAccs || []);
        setTransactions(realTxs || []);
        setAttachments(realAtts || []);
        setNotes(realNotes || []);
      }
    } catch (err) {
      console.error('Failed to load workspace data from IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData(activeScope);
  }, [activeScope, loadWorkspaceData]);

  // Derived Dashboard Totals
  const dashboardSummary = useMemo(() => {
    return calculateDashboardSummary(accounts, transactions);
  }, [accounts, transactions]);

  const getAccountBalance = useCallback(
    (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc) return 0;
      return calculateAccountBalance(acc, transactions);
    },
    [accounts, transactions]
  );

  // =========================================================================
  // Account Actions
  // =========================================================================

  const addAccount = async (
    accountData: Omit<AccountModel, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>
  ): Promise<string> => {
    const newId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    // Check tree cycle
    if (accountData.parentId && checkTreeCycle(accounts, newId, accountData.parentId)) {
      throw new Error('لا يمكن تعيين هذا الحساب كأب نظراً لوجود علاقة دائرية في الشجرة.');
    }

    const newAccount: AccountModel = {
      ...accountData,
      id: newId,
      isDemo: activeScope === 'demo',
      createdAt: now,
      updatedAt: now,
    };

    const targetStore = activeScope === 'demo' ? STORES_DEMO.ACCOUNTS : STORES_REAL.ACCOUNTS;
    await dbStorage.put(targetStore, newAccount);
    setAccounts((prev) => [...prev, newAccount]);
    return newId;
  };

  const updateAccount = async (account: AccountModel): Promise<void> => {
    // Check tree cycle
    if (account.parentId && checkTreeCycle(accounts, account.id, account.parentId)) {
      throw new Error('تعيين هذا الحساب كأب يتسبب في حلقة دائرية مفرغة.');
    }

    const updated: AccountModel = {
      ...account,
      updatedAt: new Date().toISOString(),
    };

    const targetStore = activeScope === 'demo' ? STORES_DEMO.ACCOUNTS : STORES_REAL.ACCOUNTS;
    await dbStorage.put(targetStore, updated);
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const archiveAccount = async (accountId: string): Promise<void> => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    await updateAccount({ ...acc, status: 'archived' });
  };

  const unarchiveAccount = async (accountId: string): Promise<void> => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    await updateAccount({ ...acc, status: 'active' });
  };

  const deleteAccount = async (
    accountId: string
  ): Promise<{ success: boolean; error?: string }> => {
    // Safety check: count movements and child accounts
    const relatedTxs = transactions.filter((t) => t.accountId === accountId);
    const childAccounts = accounts.filter((a) => a.parentId === accountId);

    if (relatedTxs.length > 0 || childAccounts.length > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذا الحساب لاحتوائه على ${relatedTxs.length} حركة مالية و${childAccounts.length} حسابات فرعية. الخيار الآمن المعتمد هو «أرشفة الحساب» للحفاظ على التاريخ المالي.`,
      };
    }

    const targetStore = activeScope === 'demo' ? STORES_DEMO.ACCOUNTS : STORES_REAL.ACCOUNTS;
    await dbStorage.delete(targetStore, accountId);
    setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    return { success: true };
  };

  // =========================================================================
  // Transaction Actions
  // =========================================================================

  const addTransaction = async (
    txData: Omit<TransactionModel, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>,
    newAttachments?: AttachmentModel[]
  ): Promise<string> => {
    // Invariant check: Positive amount
    if (txData.amountMinor <= 0) {
      throw new Error('يجب أن يكون مبلغ الحركة أكبر من صفر قطوعاً.');
    }

    // Invariant check: Account exists and is active
    const targetAccount = accounts.find((a) => a.id === txData.accountId);
    if (!targetAccount) {
      throw new Error('الحساب المحدد غير موجود.');
    }
    if (targetAccount.status === 'archived') {
      throw new Error('لا يمكن تسجيل حركات مالية جديدة على حساب مؤرشف.');
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const attIds: string[] = [];

    // Save attachments if any (only in real workspace)
    if (newAttachments && newAttachments.length > 0 && activeScope === 'real') {
      for (const att of newAttachments) {
        const fullAtt: AttachmentModel = {
          ...att,
          transactionId: txId,
        };
        await dbStorage.put(STORES_REAL.ATTACHMENTS, fullAtt);
        attIds.push(fullAtt.id);
        setAttachments((prev) => [...prev, fullAtt]);
      }
    }

    const newTx: TransactionModel = {
      ...txData,
      id: txId,
      attachmentIds: attIds,
      isDemo: activeScope === 'demo',
      createdAt: now,
      updatedAt: now,
    };

    const targetStore = activeScope === 'demo' ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    await dbStorage.put(targetStore, newTx);
    setTransactions((prev) => [newTx, ...prev]);
    return txId;
  };

  const updateTransaction = async (
    tx: TransactionModel,
    newAttachments?: AttachmentModel[],
    removedAttachmentIds?: string[]
  ): Promise<void> => {
    if (tx.amountMinor <= 0) {
      throw new Error('يجب أن يكون مبلغ الحركة أكبر من صفر.');
    }

    // Remove deleted attachments
    if (removedAttachmentIds && removedAttachmentIds.length > 0 && activeScope === 'real') {
      for (const attId of removedAttachmentIds) {
        await dbStorage.delete(STORES_REAL.ATTACHMENTS, attId);
      }
      setAttachments((prev) => prev.filter((a) => !removedAttachmentIds.includes(a.id)));
    }

    // Add newly added attachments
    const addedIds: string[] = [];
    if (newAttachments && newAttachments.length > 0 && activeScope === 'real') {
      for (const att of newAttachments) {
        await dbStorage.put(STORES_REAL.ATTACHMENTS, att);
        addedIds.push(att.id);
        setAttachments((prev) => [...prev, att]);
      }
    }

    const updatedAttIds = [
      ...tx.attachmentIds.filter((id) => !(removedAttachmentIds || []).includes(id)),
      ...addedIds,
    ];

    const updatedTx: TransactionModel = {
      ...tx,
      attachmentIds: updatedAttIds,
      updatedAt: new Date().toISOString(),
    };

    const targetStore = activeScope === 'demo' ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    await dbStorage.put(targetStore, updatedTx);
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
  };

  const deleteTransaction = async (transactionId: string): Promise<void> => {
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    // Delete attached files if real
    if (activeScope === 'real' && tx.attachmentIds && tx.attachmentIds.length > 0) {
      for (const attId of tx.attachmentIds) {
        await dbStorage.delete(STORES_REAL.ATTACHMENTS, attId);
      }
      setAttachments((prev) => prev.filter((a) => !tx.attachmentIds.includes(a.id)));
    }

    const targetStore = activeScope === 'demo' ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    await dbStorage.delete(targetStore, transactionId);
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
  };

  // =========================================================================
  // Category Actions
  // =========================================================================

  const addCategory = async (name: string): Promise<void> => {
    const id = `cat_${Date.now()}`;
    const newCat: CategoryModel = {
      id,
      name,
      sortOrder: categories.length + 1,
      isDemo: activeScope === 'demo',
    };
    const targetStore = activeScope === 'demo' ? STORES_DEMO.CATEGORIES : STORES_REAL.CATEGORIES;
    await dbStorage.put(targetStore, newCat);
    setCategories((prev) => [...prev, newCat]);
  };

  const updateCategory = async (id: string, name: string): Promise<void> => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const updated: CategoryModel = { ...cat, name };
    const targetStore = activeScope === 'demo' ? STORES_DEMO.CATEGORIES : STORES_REAL.CATEGORIES;
    await dbStorage.put(targetStore, updated);
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const deleteCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const inUse = accounts.some((a) => a.categoryId === id);
    if (inUse) {
      return { success: false, error: 'لا يمكن حذف التصنيف لأنه مرتبط بحسابات قائمة.' };
    }
    const targetStore = activeScope === 'demo' ? STORES_DEMO.CATEGORIES : STORES_REAL.CATEGORIES;
    await dbStorage.delete(targetStore, id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    return { success: true };
  };

  // =========================================================================
  // Notes Actions
  // =========================================================================

  const addNote = async (
    noteData: Omit<StickyNoteModel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> => {
    const id = `note_${Date.now()}`;
    const now = new Date().toISOString();
    const newNote: StickyNoteModel = {
      ...noteData,
      id,
      createdAt: now,
      updatedAt: now,
    };
    if (activeScope === 'real') {
      await dbStorage.put(STORES_REAL.NOTES, newNote);
    }
    setNotes((prev) => [newNote, ...prev]);
  };

  const updateNote = async (note: StickyNoteModel): Promise<void> => {
    const updated: StickyNoteModel = { ...note, updatedAt: new Date().toISOString() };
    if (activeScope === 'real') {
      await dbStorage.put(STORES_REAL.NOTES, updated);
    }
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const deleteNote = async (id: string): Promise<void> => {
    if (activeScope === 'real') {
      await dbStorage.delete(STORES_REAL.NOTES, id);
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleArchiveNote = async (id: string): Promise<void> => {
    const n = notes.find((item) => item.id === id);
    if (!n) return;
    await updateNote({ ...n, archived: !n.archived });
  };

  // =========================================================================
  // Workspace Actions
  // =========================================================================

  const switchScope = (scope: 'real' | 'demo') => {
    setActiveScope(scope);
    setActiveScopePref(scope);
  };

  const loadDemoData = async () => {
    await dbStorage.saveDemoWorkspace(DEMO_ACCOUNTS, INITIAL_CATEGORIES, DEMO_TRANSACTIONS);
    if (activeScope === 'demo') {
      await loadWorkspaceData('demo');
    }
  };

  const purgeDemoData = async () => {
    await dbStorage.purgeDemoWorkspace();
    if (activeScope === 'demo') {
      setAccounts([]);
      setTransactions([]);
      setNotes([]);
    }
  };

  const atomicRestoreData = async (bundleData: BackupBundle['data']) => {
    // Strictly operates on Real storage!
    await dbStorage.atomicRestore(bundleData);
    if (activeScope === 'real') {
      await loadWorkspaceData('real');
    }
  };

  const rollbackLastRestore = async (): Promise<boolean> => {
    const ok = await dbStorage.restoreLatestSnapshot();
    if (ok && activeScope === 'real') {
      await loadWorkspaceData('real');
    }
    return ok;
  };

  // =========================================================================
  // App Lock & Security
  // =========================================================================

  const unlockWithPin = async (pin: string): Promise<boolean> => {
    const auth = getPinAuthPref();
    if (!auth.hash || !auth.salt) {
      setIsLocked(false);
      return true;
    }
    const enteredHash = await computeSHA256(`${pin}:${auth.salt}`);
    if (enteredHash === auth.hash) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const lockApp = () => {
    setIsLocked(true);
  };

  const setupPin = async (newPin: string): Promise<void> => {
    const salt = Math.random().toString(36).substring(2, 10);
    const hash = await computeSHA256(`${newPin}:${salt}`);
    setPinAuthPref(hash, salt);
  };

  const removePin = async (currentPin: string): Promise<boolean> => {
    const ok = await unlockWithPin(currentPin);
    if (ok) {
      setPinAuthPref(null, null);
      setIsLocked(false);
      return true;
    }
    return false;
  };

  // =========================================================================
  // Display Settings
  // =========================================================================

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      setSidebarCollapsedPref(next);
      return next;
    });
  };

  const updateOwnerName = (name: string) => {
    setOwnerName(name);
    setOwnerNamePref(name);
  };

  const settings: UserSettings = {
    ownerName,
    currencyCode: 'SAR',
    currencySymbol: 'ر.س',
    currencyDecimals: 2,
    pinCodeHash: pinAuth.hash,
    pinSalt: pinAuth.salt,
    isLocked,
    theme,
    sidebarCollapsed,
    activeScope,
  };

  return (
    <AppContext.Provider
      value={{
        accounts,
        categories,
        transactions,
        attachments,
        notes,
        settings,
        isLoading,
        activeScope,
        dashboardSummary,
        getAccountBalance,
        addAccount,
        updateAccount,
        archiveAccount,
        unarchiveAccount,
        deleteAccount,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addCategory,
        updateCategory,
        deleteCategory,
        addNote,
        updateNote,
        deleteNote,
        toggleArchiveNote,
        switchScope,
        loadDemoData,
        purgeDemoData,
        atomicRestoreData,
        rollbackLastRestore,
        isLocked,
        hasPinSet: Boolean(pinAuth.hash),
        unlockWithPin,
        lockApp,
        setupPin,
        removePin,
        toggleTheme,
        toggleSidebar,
        updateOwnerName,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
};
