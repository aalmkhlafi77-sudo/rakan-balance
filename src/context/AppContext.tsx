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
  InterAccountTransferInput,
  DueItemContract,
  PaymentAllocationContract,
  ReminderContract,
  EntryType,
  StickyNoteModel,
  TransactionModel,
  UserSettings,
  SUPPORTED_CURRENCIES,
} from '../domain/types.ts';
import { LedgerImportPreview, LedgerImportCommitResult } from '../domain/web_ledger_import.ts';
import {
  calculateAccountBalance,
  calculateDashboardSummary,
  checkTreeCycle,
} from '../domain/balance_calculator.ts';
import { dbStorage as visitorDbStorage, STORES_DEMO, STORES_REAL } from '../storage/indexed_db.ts';
import { OwnerRemoteStorage } from '../storage/owner_remote_storage.ts';
import { useOwnerAccess } from '../components/OwnerAccessGate.tsx';
import {
  getActiveScopePref,
  getCurrencyPref,
  getFirstSetupDonePref,
  getOwnerNamePref,
  getPinAuthPref,
  getSidebarCollapsedPref,
  getThemePref,
  setActiveScopePref,
  setCurrencyPref,
  setFirstSetupDonePref,
  setOwnerNamePref,
  setPinAuthPref,
  setSidebarCollapsedPref,
  setThemePref,
} from '../storage/local_storage.ts';
import { INITIAL_CATEGORIES } from '../storage/initial_data.ts';
import { computeSHA256 } from '../storage/backup_service.ts';
import { validateTransactionInput } from '../domain/transaction_validator.ts';
import { dueRemaining, validateDueRecord, validDate } from '../domain/dues.ts';
import { MAX_SAFE_MINOR_AMOUNT, setActiveCurrencySymbol } from '../domain/money.ts';
import {
  buildTransferEntries,
  validateInterAccountTransfer,
} from '../domain/inter_account_transfer.ts';

interface AppContextType {
  // Data
  accounts: AccountModel[];
  categories: CategoryModel[];
  transactions: TransactionModel[];
  attachments: AttachmentModel[];
  notes: StickyNoteModel[];
  dues: DueItemContract[];
  allocations: PaymentAllocationContract[];
  reminders: ReminderContract[];
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

  // Inter-Account Transfer actions (Milestone N1)
  createInterAccountTransfer: (input: InterAccountTransferInput) => Promise<string>;
  updateInterAccountTransfer: (transferId: string, input: InterAccountTransferInput) => Promise<void>;
  deleteInterAccountTransfer: (transferId: string) => Promise<void>;

  // N2: dues are follow-up records; a payment is exactly ONE financial movement.
  createDue: (input: { accountId: string; entryType: EntryType; dueDate: string; amountMinor: number; notes?: string }) => Promise<string>;
  settleDue: (dueId: string, amountMinor: number, date: string) => Promise<void>;
  deleteUnpaidDue: (dueId: string) => Promise<void>;
  createReminder: (dueId: string, remindAt: string, templateText: string) => Promise<void>;
  completeReminder: (reminderId: string) => Promise<void>;

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
  atomicRestoreData: (bundleData: BackupBundle['data']) => Promise<{ success: boolean; preferenceError?: string }>;
  rollbackLastRestore: () => Promise<boolean>;
  importLedger: (preview: LedgerImportPreview) => Promise<LedgerImportCommitResult>;

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
  updateOwnerProfile: (name: string, currencyCode: string) => Promise<void>;
  updateCurrency: (code: string, symbol: string, name?: string) => Promise<void>;
  completeFirstSetup: (ownerName: string, currencyCode: string, currencySymbol: string, currencyName: string, initialPin?: string) => Promise<void>;
  returnToWelcomeScreen: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ownerAccess = useOwnerAccess();
  const ownerDbStorage = useMemo(() => new OwnerRemoteStorage(() => ownerAccess.csrfToken), [ownerAccess.csrfToken]);
  const dbStorage = ownerAccess.status === 'owner' ? ownerDbStorage as unknown as typeof visitorDbStorage : visitorDbStorage;
  const [isLoading, setIsLoading] = useState(true);
  const [ownerLoadError, setOwnerLoadError] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<'real' | 'demo'>(
    (import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true' && ownerAccess.status !== 'owner')
      ? getActiveScopePref() : 'real'
  );

  // In-memory active stores
  const [accounts, setAccounts] = useState<AccountModel[]>([]);
  const [categories, setCategories] = useState<CategoryModel[]>([]);
  const [transactions, setTransactions] = useState<TransactionModel[]>([]);
  const [attachments, setAttachments] = useState<AttachmentModel[]>([]);
  const [notes, setNotes] = useState<StickyNoteModel[]>([]);
  const [dues, setDues] = useState<DueItemContract[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocationContract[]>([]);
  const [reminders, setReminders] = useState<ReminderContract[]>([]);

  // Settings & Security
  const [theme, setTheme] = useState<'dark' | 'light'>(getThemePref());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSidebarCollapsedPref());
  const [ownerName, setOwnerName] = useState<string>(getOwnerNamePref());
  const initialCurrency = getCurrencyPref();
  const [currencyCode, setCurrencyCode] = useState<string>(initialCurrency.code);
  const [currencySymbol, setCurrencySymbol] = useState<string>(initialCurrency.symbol);
  const [currencyName, setCurrencyName] = useState<string>(initialCurrency.name);
  const [isFirstSetupDone, setIsFirstSetupDone] = useState<boolean>(getFirstSetupDonePref());
  const pinAuth = getPinAuthPref();
  const [isLocked, setIsLocked] = useState<boolean>(ownerAccess.status !== 'owner' && Boolean(pinAuth.hash));

  // Initialize theme on DOM and active currency symbol globally
  useEffect(() => {
    setThemePref(theme);
  }, [theme]);

  useEffect(() => {
    setActiveCurrencySymbol(currencySymbol);
  }, [currencySymbol]);

  // Load workspace data based on active scope
  const loadWorkspaceData = useCallback(async (scope: 'real' | 'demo') => {
    setIsLoading(true);
    if (ownerAccess.status === 'owner') setOwnerLoadError(null);
    try {
      if (scope === 'demo') {
        // Fictional data exists only in tests, never a shipped production asset.
        if (!(import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true') || ownerAccess.status === 'owner') {
          throw new Error('مساحة المعاينة غير متاحة في نسخة الإنتاج.');
        }
        const { DEMO_ACCOUNTS, DEMO_TRANSACTIONS, DEMO_NOTES } =
          await import('../../tests/fixtures/demo-seed.ts');
        let [demoAccs, demoCats, demoTxs, demoNotes, demoDues, demoAllocations, demoReminders] = await Promise.all([
          dbStorage.getAll<AccountModel>(STORES_DEMO.ACCOUNTS),
          dbStorage.getAll<CategoryModel>(STORES_DEMO.CATEGORIES),
          dbStorage.getAll<TransactionModel>(STORES_DEMO.TRANSACTIONS),
          dbStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES),
          dbStorage.getAll<DueItemContract>(STORES_DEMO.DUES),
          dbStorage.getAll<PaymentAllocationContract>(STORES_DEMO.ALLOCATIONS),
          dbStorage.getAll<ReminderContract>(STORES_DEMO.REMINDERS),
        ]);

        // Auto-seed demo workspace if empty
        if (!demoAccs || demoAccs.length === 0) {
          await dbStorage.saveDemoWorkspace(DEMO_ACCOUNTS, INITIAL_CATEGORIES, DEMO_TRANSACTIONS, DEMO_NOTES);
          demoAccs = DEMO_ACCOUNTS;
          demoCats = INITIAL_CATEGORIES;
          demoTxs = DEMO_TRANSACTIONS;
          demoNotes = DEMO_NOTES;
        }

        setAccounts(demoAccs);
        setCategories(demoCats);
        setTransactions(demoTxs);
        setAttachments([]);
        setNotes(demoNotes || []);
        setDues(demoDues || []);
        setAllocations(demoAllocations || []);
        setReminders(demoReminders || []);
      } else {
        // Real Workspace
        const [realAccs, realCats, realTxs, realAtts, realNotes, realDues, realAllocations, realReminders] = await Promise.all([
          dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
          dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
          dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
          dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
          dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
          dbStorage.getAll<DueItemContract>(STORES_REAL.DUES),
          dbStorage.getAll<PaymentAllocationContract>(STORES_REAL.ALLOCATIONS),
          dbStorage.getAll<ReminderContract>(STORES_REAL.REMINDERS),
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
        setDues(realDues || []);
        setAllocations(realAllocations || []);
        setReminders(realReminders || []);
        if (ownerAccess.status === 'owner') {
          const saved = await ownerDbStorage.getSafeSettings();
          setOwnerName(saved?.ownerName?.trim() || 'المالك');
          const currency = SUPPORTED_CURRENCIES.find((x) => x.code === saved?.currencyCode)
            || SUPPORTED_CURRENCIES[0];
          setCurrencyCode(currency.code);
          setCurrencySymbol(currency.symbol);
          setCurrencyName(currency.name);
          setIsFirstSetupDone(true);
        }
      }
    } catch (err) {
      if (ownerAccess.status === 'owner') {
        setOwnerLoadError('تعذر تحميل البيانات الخاصة من الخادم. أُوقفت الوظائف المالية لمنع الحفظ محليًا أو عرض أرصدة غير مؤكدة.');
      } else {
        console.error('Failed to load local workspace:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [dbStorage, ownerDbStorage, ownerAccess.status]);

  useEffect(() => {
    loadWorkspaceData(activeScope);
  }, [activeScope, loadWorkspaceData]);

  // Owner data is refreshed without ever persisting it in visitor IndexedDB.
  useEffect(() => {
    if (ownerAccess.status !== 'owner') return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const changed = await ownerDbStorage.refreshIfChanged();
        if (!cancelled && changed) await loadWorkspaceData('real');
      } catch {
        if (!cancelled) setOwnerLoadError('انقطع الاتصال بالخادم الخاص. أُوقفت العمليات حتى إعادة التحقق.');
      }
    };
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    const onConflict = () => { void refresh(); };
    window.addEventListener('rakan-owner-ledger-conflict', onConflict);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('rakan-owner-ledger-conflict', onConflict);
    };
  }, [ownerAccess.status, ownerDbStorage, loadWorkspaceData]);

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

    if (relatedTxs.length > 0 || childAccounts.length > 0 || dues.some(d => d.accountId === accountId)) {
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
  // Transaction Actions (Atomic via IndexedDB Transaction - Review Fix #2)
  // =========================================================================

  const addTransaction = async (
    txData: Omit<TransactionModel, 'id' | 'createdAt' | 'updatedAt' | 'isDemo'>,
    newAttachments?: AttachmentModel[]
  ): Promise<string> => {
    // Sanitize input so regular transaction creation cannot inject arbitrary transfer metadata
    const {
      transferId: _tid,
      transferRole: _trole,
      counterpartyAccountId: _cpid,
      ...sanitizedData
    } = txData as any;

    // Centralized strict validation: positive integer halalas, account exists & is active, valid date/desc
    const validation = validateTransactionInput(
      {
        accountId: sanitizedData.accountId,
        entryType: sanitizedData.entryType,
        amountMinor: sanitizedData.amountMinor,
        date: sanitizedData.date,
        description: sanitizedData.description,
      },
      accounts
    );
    if (!validation.isValid) {
      throw new Error(validation.error || 'بيانات الحركة المالية غير صالحة.');
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const isDemo = activeScope === 'demo';

    // Prepare full attachments
    const preparedAttachments: AttachmentModel[] = [];
    const attIds: string[] = [];

    if (newAttachments && newAttachments.length > 0 && !isDemo) {
      for (const att of newAttachments) {
        const fullAtt: AttachmentModel = {
          ...att,
          transactionId: txId,
        };
        preparedAttachments.push(fullAtt);
        attIds.push(fullAtt.id);
      }
    }

    const newTx: TransactionModel = {
      ...sanitizedData,
      id: txId,
      attachmentIds: attIds,
      isDemo,
      createdAt: now,
      updatedAt: now,
    };

    // Save atomically inside ONE transaction. Only updates state on transaction completion!
    await dbStorage.saveTransactionAtomic(newTx, preparedAttachments, isDemo);

    setTransactions((prev) => [newTx, ...prev]);
    if (preparedAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...preparedAttachments]);
    }

    return txId;
  };

  const updateTransaction = async (
    tx: TransactionModel,
    newAttachments?: AttachmentModel[],
    removedAttachmentIds?: string[]
  ): Promise<void> => {
    // Single-entry protection: reject modifying an inter-account transfer leg individually
    if (tx.transferId) {
      throw new Error(
        'لا يمكن تعديل طرف واحد من حركة بينية بشكل منفصل. يرجى استخدام شاشة تعديل الحركة البينية.'
      );
    }

    if (allocations.some(a => a.paymentTransactionId === tx.id)) throw new Error('لا يمكن تعديل دفعة مرتبطة باستحقاق.');
    // Centralized strict validation for updated transaction
    const validation = validateTransactionInput(
      {
        accountId: tx.accountId,
        entryType: tx.entryType,
        amountMinor: tx.amountMinor,
        date: tx.date,
        description: tx.description,
      },
      accounts
    );
    if (!validation.isValid) {
      throw new Error(validation.error || 'بيانات الحركة المعدلة غير صالحة.');
    }

    const isDemo = activeScope === 'demo';
    const toRemove = removedAttachmentIds || [];
    const toAdd: AttachmentModel[] = [];
    const addedIds: string[] = [];

    if (newAttachments && newAttachments.length > 0 && !isDemo) {
      for (const att of newAttachments) {
        const fullAtt: AttachmentModel = {
          ...att,
          transactionId: tx.id,
        };
        toAdd.push(fullAtt);
        addedIds.push(fullAtt.id);
      }
    }

    const updatedAttIds = [
      ...tx.attachmentIds.filter((id) => !toRemove.includes(id)),
      ...addedIds,
    ];

    const updatedTx: TransactionModel = {
      ...tx,
      attachmentIds: updatedAttIds,
      updatedAt: new Date().toISOString(),
    };

    // Execute atomic update in a single transaction
    await dbStorage.updateTransactionAtomic(updatedTx, toAdd, toRemove, isDemo);

    // Update in-memory state only upon complete transaction success
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
    if (!isDemo) {
      setAttachments((prev) => [
        ...prev.filter((a) => !toRemove.includes(a.id)),
        ...toAdd,
      ]);
    }
  };

  const deleteTransaction = async (transactionId: string): Promise<void> => {
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    // Single-entry protection: reject deleting an inter-account transfer leg individually
    if (tx.transferId) {
      throw new Error(
        'لا يمكن حذف طرف واحد من حركة بينية بشكل منفصل. يرجى حذف الحركة البينية ككل.'
      );
    }

    if (allocations.some(a => a.paymentTransactionId === transactionId)) throw new Error('لا يمكن حذف دفعة مرتبطة باستحقاق.');
    const isDemo = activeScope === 'demo';
    const attIds = tx.attachmentIds || [];

    // Atomically delete transaction and all linked attachments inside ONE transaction
    await dbStorage.deleteTransactionAtomic(transactionId, attIds, isDemo);

    // Update in-memory state only on complete transaction success
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
    if (!isDemo && attIds.length > 0) {
      setAttachments((prev) => prev.filter((a) => !attIds.includes(a.id)));
    }
  };

  // =========================================================================
  // Inter-Account Transfer Actions (Milestone N1)
  // Atomic generation, modification, and deletion of paired transfer entries
  // =========================================================================

  const createInterAccountTransfer = async (
    input: InterAccountTransferInput
  ): Promise<string> => {
    const isDemo = activeScope === 'demo';
    const scopedInput: InterAccountTransferInput = { ...input, isDemo };

    // 1. Strict Domain Validation
    const validation = validateInterAccountTransfer(scopedInput, accounts, transactions);
    if (!validation.isValid) {
      throw new Error(validation.error || 'بيانات الحركة البينية غير صالحة.');
    }

    // 2. Build paired transfer entries
    const { transferId, sourceEntry, destinationEntry } = buildTransferEntries(scopedInput);

    // 3. Atomically persist both entries inside ONE IndexedDB transaction using store.add()
    await dbStorage.saveTransferAtomic(sourceEntry, destinationEntry, isDemo);

    // 4. Update memory state upon complete transaction success
    setTransactions((prev) => [sourceEntry, destinationEntry, ...prev]);

    return transferId;
  };

  const updateInterAccountTransfer = async (
    transferId: string,
    input: InterAccountTransferInput
  ): Promise<void> => {
    const isDemo = activeScope === 'demo';
    const scopedInput: InterAccountTransferInput = { ...input, isDemo };

    // 1. Validate against current transactions with editingTransferId specified
    const validation = validateInterAccountTransfer(
      scopedInput,
      accounts,
      transactions,
      transferId
    );
    if (!validation.isValid) {
      throw new Error(validation.error || 'بيانات تعديل الحركة البينية غير صالحة.');
    }

    // 2. Build updated paired transfer entries
    const { sourceEntry, destinationEntry } = buildTransferEntries(scopedInput, transferId);

    // 3. Atomically update in ONE transaction
    await dbStorage.updateTransferAtomic(transferId, sourceEntry, destinationEntry, isDemo);

    // 4. Update state upon complete transaction success
    setTransactions((prev) => [
      sourceEntry,
      destinationEntry,
      ...prev.filter((t) => t.transferId !== transferId),
    ]);
  };

  const deleteInterAccountTransfer = async (transferId: string): Promise<void> => {
    const isDemo = activeScope === 'demo';

    // 1. Atomically delete both entries in ONE transaction
    await dbStorage.deleteTransferAtomic(transferId, isDemo);

    // 2. Update state upon complete transaction success
    setTransactions((prev) => prev.filter((t) => t.transferId !== transferId));
  };

  // =========================================================================
  // N2: Due Follow-up, Partial Settlements and Manual Reminders
  // =========================================================================

  const createDue = async (input: { accountId: string; entryType: EntryType; dueDate: string; amountMinor: number; notes?: string }): Promise<string> => {
    const account = accounts.find(a => a.id === input.accountId);
    if (!account || account.status !== 'active') throw new Error('اختر حساباً نشطاً.');
    const signedBalance = getAccountBalance(account.id);
    const availableBalance = input.entryType === 'owedByAccount' ? signedBalance : -signedBalance;
    const outstandingDues = dues.filter(d => d.accountId === account.id && d.entryType === input.entryType)
      .reduce((sum, d) => sum + dueRemaining(d), 0);
    if (availableBalance <= 0 || input.amountMinor > availableBalance - outstandingDues) {
      throw new Error('مبلغ الاستحقاق يتجاوز الرصيد المتاح غير المصنف في استحقاقات أخرى.');
    }
    const now = new Date().toISOString();
    const due: DueItemContract = {
      id: crypto.randomUUID(), accountId: input.accountId, entryType: input.entryType,
      dueDate: input.dueDate, originalAmountMinor: input.amountMinor,
      settledAmountMinor: 0, status: 'pending', notes: input.notes?.trim() || undefined,
      createdAt: now, updatedAt: now,
    };
    validateDueRecord(due, accounts, transactions);
    await dbStorage.addDue(due, activeScope === 'demo');
    setDues(prev => [...prev, due]);
    return due.id;
  };

  const deleteUnpaidDue = async (dueId: string): Promise<void> => {
    await dbStorage.deleteUnpaidDueAtomic(dueId, activeScope === 'demo');
    setDues(prev => prev.filter(d => d.id !== dueId));
    setReminders(prev => prev.filter(r => r.dueItemId !== dueId));
  };

  const settleDue = async (dueId: string, amountMinor: number, date: string): Promise<void> => {
    const due = dues.find(d => d.id === dueId);
    if (!due) throw new Error('الاستحقاق غير موجود.');
    const account = accounts.find(a => a.id === due.accountId);
    if (!account || account.status !== 'active') throw new Error('الحساب غير نشط.');
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_SAFE_MINOR_AMOUNT ||
      amountMinor > dueRemaining(due)) throw new Error('الدفعة تتجاوز المتبقي أو مبلغها غير صالح.');
    const balance = getAccountBalance(due.accountId);
    const available = due.entryType === 'owedByAccount' ? balance : -balance;
    if (amountMinor > available) throw new Error('الدفعة تتجاوز الرصيد المالي الحالي للحساب.');
    const entryType: EntryType = due.entryType === 'owedByAccount' ? 'owedToAccount' : 'owedByAccount';
    const validation = validateTransactionInput({
      accountId: due.accountId, entryType, amountMinor, date,
      description: 'سداد استحقاق بتاريخ ' + due.dueDate,
    }, accounts);
    if (!validation.isValid) throw new Error(validation.error || 'بيانات دفعة الاستحقاق غير صالحة.');
    const now = new Date().toISOString();
    const payment: TransactionModel = {
      id: crypto.randomUUID(), accountId: due.accountId, entryType, amountMinor, date,
      description: 'سداد استحقاق بتاريخ ' + due.dueDate, attachmentIds: [],
      isDemo: activeScope === 'demo', createdAt: now, updatedAt: now,
    };
    const allocation: PaymentAllocationContract = {
      id: crypto.randomUUID(), dueItemId: due.id, paymentTransactionId: payment.id, amountMinor,
    };
    await dbStorage.recordDuePaymentAtomic(due.id, payment, allocation, activeScope === 'demo');
    setTransactions(prev => [payment, ...prev]);
    setAllocations(prev => [...prev, allocation]);
    setDues(prev => prev.map(d => d.id === dueId
      ? { ...d, settledAmountMinor: d.settledAmountMinor + amountMinor,
          status: d.settledAmountMinor + amountMinor === d.originalAmountMinor ? 'settled' : 'partially_settled', updatedAt: now }
      : d));
  };

  const createReminder = async (dueId: string, remindAt: string, templateText: string): Promise<void> => {
    if (!dues.some(d => d.id === dueId)) throw new Error('استحقاق التذكير غير موجود.');
    if (!validDate(remindAt) || !templateText.trim()) throw new Error('تاريخ أو نص التذكير غير صالح.');
    const reminder: ReminderContract = {
      id: crypto.randomUUID(), dueItemId: dueId, remindAt,
      templateText: templateText.trim(), isCompleted: false, channel: 'manual',
    };
    await dbStorage.addReminder(reminder, activeScope === 'demo');
    setReminders(prev => [...prev, reminder]);
  };

  const completeReminder = async (reminderId: string): Promise<void> => {
    await dbStorage.markReminderCompleted(reminderId, activeScope === 'demo');
    setReminders(prev => prev.map(r => r.id === reminderId ? { ...r, isCompleted: true } : r));
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
  // Notes Actions (Isolated Demo Persistence - Review Fix #5)
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
    const targetStore = activeScope === 'demo' ? STORES_DEMO.NOTES : STORES_REAL.NOTES;
    await dbStorage.put(targetStore, newNote);
    setNotes((prev) => [newNote, ...prev]);
  };

  const updateNote = async (note: StickyNoteModel): Promise<void> => {
    const updated: StickyNoteModel = { ...note, updatedAt: new Date().toISOString() };
    const targetStore = activeScope === 'demo' ? STORES_DEMO.NOTES : STORES_REAL.NOTES;
    await dbStorage.put(targetStore, updated);
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const deleteNote = async (id: string): Promise<void> => {
    const targetStore = activeScope === 'demo' ? STORES_DEMO.NOTES : STORES_REAL.NOTES;
    await dbStorage.delete(targetStore, id);
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
    if (scope === 'demo' && (!(import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true') || ownerAccess.status === 'owner')) return;
    setActiveScope(scope);
    setActiveScopePref(scope);
  };

  const loadDemoData = async () => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true') || ownerAccess.status === 'owner') throw new Error('هذه الوظيفة غير متاحة في نسخة الإنتاج.');
    const { DEMO_ACCOUNTS, DEMO_TRANSACTIONS, DEMO_NOTES } =
      await import('../../tests/fixtures/demo-seed.ts');
    await dbStorage.saveDemoWorkspace(DEMO_ACCOUNTS, INITIAL_CATEGORIES, DEMO_TRANSACTIONS, DEMO_NOTES);
    if (activeScope === 'demo') {
      await loadWorkspaceData('demo');
    }
  };

  const purgeDemoData = async () => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_E2E_DEMO_MODE === 'true') || ownerAccess.status === 'owner') throw new Error('هذه الوظيفة غير متاحة في نسخة الإنتاج.');
    await dbStorage.purgeDemoWorkspace();
    if (activeScope === 'demo') {
      setAccounts([]);
      setTransactions([]);
      setNotes([]);
      setDues([]);
      setAllocations([]);
      setReminders([]);
    }
  };

  const atomicRestoreData = async (
    bundleData: BackupBundle['data']
  ): Promise<{ success: boolean; preferenceError?: string }> => {
    // 1. Pre-validation of currency if present in settings
    let matchedCurrency = null;
    if (bundleData.settings?.currencyCode) {
      const codeUpper = bundleData.settings.currencyCode.trim().toUpperCase();
      matchedCurrency = SUPPORTED_CURRENCIES.find((c) => c.code === codeUpper);
      if (!matchedCurrency) {
        throw new Error(
          `عملة النسخة غير مدعومة (${bundleData.settings.currencyCode}). تم إلغاء الاستعادة قبل إجراء أي تعديل.`
        );
      }
    }

    // 2. Strictly operates on Real IndexedDB stores atomically in a single transaction
    await dbStorage.atomicRestore(bundleData);

    // 3. Post-DB transaction: Apply non-sensitive preferences to UI/LocalStorage with explicit error boundary
    let prefErrorMsg: string | undefined = undefined;
    try {
      if (bundleData.settings) {
        if (bundleData.settings.ownerName) {
          updateOwnerName(bundleData.settings.ownerName);
        }
        if (bundleData.settings.theme === 'light' || bundleData.settings.theme === 'dark') {
          setTheme(bundleData.settings.theme);
          setThemePref(bundleData.settings.theme);
        }
        if (matchedCurrency) {
          await updateCurrency(
            matchedCurrency.code,
            matchedCurrency.symbol,
            matchedCurrency.name
          );
        } else if (bundleData.settings.currencyCode && bundleData.settings.currencySymbol) {
          await updateCurrency(
            bundleData.settings.currencyCode,
            bundleData.settings.currencySymbol,
            bundleData.settings.currencyName
          );
        }
        if (typeof bundleData.settings.sidebarCollapsed === 'boolean') {
          setSidebarCollapsed(bundleData.settings.sidebarCollapsed);
          setSidebarCollapsedPref(bundleData.settings.sidebarCollapsed);
        }
      }
    } catch (prefError: any) {
      prefErrorMsg = prefError?.message || String(prefError);
      console.warn(
        'تنبيه: تمت استعادة البيانات المالية في قاعدة البيانات بنجاح، لكن تعذر تطبيق تفضيلات المظهر/العملة:',
        prefError
      );
    }

    if (activeScope === 'real') {
      await loadWorkspaceData('real');
    }

    return {
      success: true,
      preferenceError: prefErrorMsg,
    };
  };

  const rollbackLastRestore = async (): Promise<boolean> => {
    const ok = await dbStorage.restoreLatestSnapshot();
    if (ok && activeScope === 'real') {
      await loadWorkspaceData('real');
    }
    return ok;
  };

  const importLedger = async (
    preview: LedgerImportPreview
  ): Promise<LedgerImportCommitResult> => {
    if (!preview.canCommit) {
      throw new Error('المعاينة تحتوي على أخطاء مانعة أو لا تحتوي على سجلات جديدة.');
    }
    const result = await dbStorage.importLedgerAtomic(preview, activeScope);
    await loadWorkspaceData(activeScope);
    return result;
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

  const updateOwnerProfile = async (name: string, currencyCode: string): Promise<void> => {
    if (ownerAccess.status !== 'owner') throw new Error('هذه الوظيفة خاصة بحساب المالك.');
    const currency = SUPPORTED_CURRENCIES.find(x => x.code === currencyCode);
    if (!currency) throw new Error('العملة غير مدعومة.');
    await ownerDbStorage.updateOwnerPreferences(name, currency);
    setOwnerName(name.trim());
    setCurrencyCode(currency.code);
    setCurrencySymbol(currency.symbol);
    setCurrencyName(currency.name);
    setActiveCurrencySymbol(currency.symbol);
  };

  const updateOwnerName = (name: string) => {
    setOwnerName(name);
    setOwnerNamePref(name);
  };

  const updateCurrency = async (code: string, symbol: string, name?: string): Promise<void> => {
    const cleanCode = code.trim().toUpperCase();
    const cleanSymbol = symbol.trim();
    const cleanName = (name || cleanCode).trim();
    
    // Updates presentation settings ONLY.
    // Explicitly prevents modifying existing minor unit integers or recalculating balances.
    setCurrencyCode(cleanCode);
    setCurrencySymbol(cleanSymbol);
    setCurrencyName(cleanName);
    setCurrencyPref(cleanCode, cleanSymbol, cleanName);
    setActiveCurrencySymbol(cleanSymbol);
  };

  const completeFirstSetup = async (
    newOwnerName: string,
    newCurrencyCode: string,
    newCurrencySymbol: string,
    newCurrencyName: string,
    initialPin?: string
  ): Promise<void> => {
    if (newOwnerName.trim()) {
      updateOwnerName(newOwnerName.trim());
    }
    await updateCurrency(newCurrencyCode, newCurrencySymbol, newCurrencyName);
    if (initialPin && initialPin.length >= 4 && initialPin.length <= 8) {
      await setupPin(initialPin);
    }
    setIsFirstSetupDone(true);
    setFirstSetupDonePref(true);
  };

  const returnToWelcomeScreen = () => {
    setIsFirstSetupDone(false);
    setFirstSetupDonePref(false);
  };

  const settings: UserSettings = {
    ownerName,
    currencyCode,
    currencySymbol,
    currencyName,
    currencyDecimals: 2,
    isFirstSetupDone,
    pinCodeHash: ownerAccess.status === 'owner' ? null : pinAuth.hash,
    pinSalt: ownerAccess.status === 'owner' ? null : pinAuth.salt,
    isLocked,
    theme,
    sidebarCollapsed,
    activeScope,
  };

  if (ownerAccess.status === 'owner' && ownerLoadError) {
    return (
      <section dir="rtl" role="alert" className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4 bg-slate-950 text-white">
        <h1 className="font-bold text-lg">تعذر الوصول إلى بيانات المالك</h1>
        <p className="max-w-md text-sm leading-7">{ownerLoadError}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => { void loadWorkspaceData('real'); }} className="px-5 py-3 rounded-xl bg-emerald-700 font-semibold">إعادة المحاولة</button>
          <button type="button" onClick={() => { void ownerAccess.logout(); }} className="px-5 py-3 rounded-xl border border-slate-400 font-semibold">تسجيل الخروج</button>
        </div>
      </section>
    );
  }

  return (
    <AppContext.Provider
      value={{
        accounts,
        categories,
        transactions,
        attachments,
        notes,
        dues,
        allocations,
        reminders,
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
        createInterAccountTransfer,
        updateInterAccountTransfer,
        deleteInterAccountTransfer,
        createDue,
        settleDue,
        deleteUnpaidDue,
        createReminder,
        completeReminder,
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
        importLedger,
        isLocked,
        hasPinSet: ownerAccess.status !== 'owner' && Boolean(pinAuth.hash),
        unlockWithPin,
        lockApp,
        setupPin,
        removePin,
        toggleTheme,
        toggleSidebar,
        updateOwnerName,
        updateOwnerProfile,
        updateCurrency,
        completeFirstSetup,
        returnToWelcomeScreen,
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
