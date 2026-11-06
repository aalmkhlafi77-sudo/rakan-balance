/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — IndexedDB Storage Engine
 * Follows Document v2 & Review Fix #2 & #5:
 * 1. Financial data strictly stored in IndexedDB.
 * 2. True atomic operations for adding, updating, and deleting transactions + attachments in ONE transaction.
 * 3. Complete physical isolation between Real and Demo object stores (including demo_notes).
 * 4. True atomic (All-or-Nothing) restore within a single IndexedDB transaction with automatic rollback snapshots.
 */

import {
  AccountModel,
  AttachmentModel,
  BackupBundle,
  CategoryModel,
  StickyNoteModel,
  TransactionModel,
  UserSettings,
} from '../domain/types.ts';

const DB_NAME = 'RakanBalanceDB_v2';
const DB_VERSION = 2; // Incremented to version 2 to include demo_notes

// Real workspace object stores
export const STORES_REAL = {
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  ATTACHMENTS: 'attachments',
  NOTES: 'notes',
  SETTINGS: 'settings',
} as const;

// Isolated Demo workspace object stores (completely separated from real data)
export const STORES_DEMO = {
  ACCOUNTS: 'demo_accounts',
  CATEGORIES: 'demo_categories',
  TRANSACTIONS: 'demo_transactions',
  NOTES: 'demo_notes',
} as const;

// Rollback Snapshot store
export const STORE_SNAPSHOTS = 'rollback_snapshots';

class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Real Object Stores
        if (!db.objectStoreNames.contains(STORES_REAL.ACCOUNTS)) {
          const s = db.createObjectStore(STORES_REAL.ACCOUNTS, { keyPath: 'id' });
          s.createIndex('categoryId', 'categoryId', { unique: false });
          s.createIndex('parentId', 'parentId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES_REAL.CATEGORIES)) {
          db.createObjectStore(STORES_REAL.CATEGORIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES_REAL.TRANSACTIONS)) {
          const s = db.createObjectStore(STORES_REAL.TRANSACTIONS, { keyPath: 'id' });
          s.createIndex('accountId', 'accountId', { unique: false });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES_REAL.ATTACHMENTS)) {
          const s = db.createObjectStore(STORES_REAL.ATTACHMENTS, { keyPath: 'id' });
          s.createIndex('transactionId', 'transactionId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES_REAL.NOTES)) {
          db.createObjectStore(STORES_REAL.NOTES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES_REAL.SETTINGS)) {
          db.createObjectStore(STORES_REAL.SETTINGS, { keyPath: 'key' });
        }

        // Isolated Demo Object Stores
        if (!db.objectStoreNames.contains(STORES_DEMO.ACCOUNTS)) {
          db.createObjectStore(STORES_DEMO.ACCOUNTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES_DEMO.CATEGORIES)) {
          db.createObjectStore(STORES_DEMO.CATEGORIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES_DEMO.TRANSACTIONS)) {
          const s = db.createObjectStore(STORES_DEMO.TRANSACTIONS, { keyPath: 'id' });
          s.createIndex('accountId', 'accountId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES_DEMO.NOTES)) {
          db.createObjectStore(STORES_DEMO.NOTES, { keyPath: 'id' });
        }

        // Rollback snapshots store
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // =========================================================================
  // Generic Single Store CRUD
  // =========================================================================

  public async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  public async put<T>(storeName: string, item: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  public async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  public async clearStore(storeName: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // Atomic Operations for Transactions & Attachments (Review Fix #2)
  // Operation only considered successful when the entire transaction completes!
  // =========================================================================

  /**
   * Atomically saves a new transaction and all its attachments inside a SINGLE transaction.
   * If saving either the transaction or any attachment fails, everything rolls back.
   */
  public async saveTransactionAtomic(
    txData: TransactionModel,
    newAttachments: AttachmentModel[],
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const txStoreName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    const attStoreName = STORES_REAL.ATTACHMENTS;

    const storesToLock = isDemo || newAttachments.length === 0
      ? [txStoreName]
      : [txStoreName, attStoreName];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storesToLock, 'readwrite');

      tx.onerror = () => {
        reject(new Error(`فشلت المعاملة الذرية لحفظ الحركة: ${tx.error?.message || 'خطأ غير معروف'}`));
      };

      tx.onabort = () => {
        reject(new Error('تم إلغاء المعاملة الذرية لحفظ الحركة ولم يتم حفظ أي بيانات جزئية.'));
      };

      tx.oncomplete = () => {
        resolve();
      };

      try {
        // 1. Put transaction
        const txStore = tx.objectStore(txStoreName);
        txStore.put(txData);

        // 2. Put attachments within the same transaction (real workspace)
        if (!isDemo && newAttachments.length > 0) {
          const attStore = tx.objectStore(attStoreName);
          for (const att of newAttachments) {
            attStore.put(att);
          }
        }
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  /**
   * Atomically updates a transaction, adds new attachments, and deletes removed attachments
   * inside a SINGLE transaction.
   */
  public async updateTransactionAtomic(
    txData: TransactionModel,
    newAttachments: AttachmentModel[],
    removedAttachmentIds: string[],
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const txStoreName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    const attStoreName = STORES_REAL.ATTACHMENTS;

    const storesToLock = isDemo || (newAttachments.length === 0 && removedAttachmentIds.length === 0)
      ? [txStoreName]
      : [txStoreName, attStoreName];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storesToLock, 'readwrite');

      tx.onerror = () => {
        reject(new Error(`فشلت المعاملة الذرية لتعديل الحركة: ${tx.error?.message || 'خطأ غير معروف'}`));
      };

      tx.onabort = () => {
        reject(new Error('تم إلغاء تعديل الحركة الذري وبقيت الحالة السابقة كما هي.'));
      };

      tx.oncomplete = () => {
        resolve();
      };

      try {
        // 1. Update transaction record
        const txStore = tx.objectStore(txStoreName);
        txStore.put(txData);

        // 2. Update attachments in the same transaction
        if (!isDemo) {
          const attStore = tx.objectStore(attStoreName);
          for (const attId of removedAttachmentIds) {
            attStore.delete(attId);
          }
          for (const att of newAttachments) {
            attStore.put(att);
          }
        }
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  /**
   * Atomically deletes a transaction and all its associated attachments inside a SINGLE transaction.
   */
  public async deleteTransactionAtomic(
    txId: string,
    attachmentIds: string[],
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const txStoreName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    const attStoreName = STORES_REAL.ATTACHMENTS;

    const storesToLock = isDemo || attachmentIds.length === 0
      ? [txStoreName]
      : [txStoreName, attStoreName];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storesToLock, 'readwrite');

      tx.onerror = () => {
        reject(new Error(`فشلت المعاملة الذرية لحذف الحركة: ${tx.error?.message || 'خطأ غير معروف'}`));
      };

      tx.onabort = () => {
        reject(new Error('تم إلغاء حذف الحركة الذري وبقيت البيانات دون تعديل.'));
      };

      tx.oncomplete = () => {
        resolve();
      };

      try {
        // 1. Delete transaction record
        const txStore = tx.objectStore(txStoreName);
        txStore.delete(txId);

        // 2. Delete all linked attachments in the same atomic transaction
        if (!isDemo && attachmentIds.length > 0) {
          const attStore = tx.objectStore(attStoreName);
          for (const attId of attachmentIds) {
            attStore.delete(attId);
          }
        }
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  // =========================================================================
  // Demo Workspace Isolation & Safe Purge (Review Fix #5)
  // Guaranteed NEVER to touch Real data stores!
  // =========================================================================

  public async purgeDemoWorkspace(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORES_DEMO.ACCOUNTS, STORES_DEMO.CATEGORIES, STORES_DEMO.TRANSACTIONS, STORES_DEMO.NOTES],
        'readwrite'
      );
      tx.objectStore(STORES_DEMO.ACCOUNTS).clear();
      tx.objectStore(STORES_DEMO.CATEGORIES).clear();
      tx.objectStore(STORES_DEMO.TRANSACTIONS).clear();
      tx.objectStore(STORES_DEMO.NOTES).clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async saveDemoWorkspace(
    accounts: AccountModel[],
    categories: CategoryModel[],
    transactions: TransactionModel[],
    notes: StickyNoteModel[]
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORES_DEMO.ACCOUNTS, STORES_DEMO.CATEGORIES, STORES_DEMO.TRANSACTIONS, STORES_DEMO.NOTES],
        'readwrite'
      );

      const accStore = tx.objectStore(STORES_DEMO.ACCOUNTS);
      accStore.clear();
      accounts.forEach((a) => accStore.put(a));

      const catStore = tx.objectStore(STORES_DEMO.CATEGORIES);
      catStore.clear();
      categories.forEach((c) => catStore.put(c));

      const txStore = tx.objectStore(STORES_DEMO.TRANSACTIONS);
      txStore.clear();
      transactions.forEach((t) => txStore.put(t));

      const notesStore = tx.objectStore(STORES_DEMO.NOTES);
      notesStore.clear();
      notes.forEach((n) => notesStore.put(n));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // =========================================================================
  // True Atomic All-or-Nothing Restore with Rollback Snapshot
  // =========================================================================

  /**
   * Captures current real database state as a rollback snapshot.
   */
  public async createRollbackSnapshot(): Promise<string> {
    const [accounts, categories, transactions, attachments, notes] = await Promise.all([
      this.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
      this.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
      this.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
      this.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
      this.getAll<StickyNoteModel>(STORES_REAL.NOTES),
    ]);

    const snapshotId = `snapshot_${Date.now()}`;
    const snapshot = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      data: { accounts, categories, transactions, attachments, notes },
    };

    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
      tx.objectStore(STORE_SNAPSHOTS).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return snapshotId;
  }

  /**
   * Executes an atomic restore across all real stores inside ONE transaction.
   * If any record or attachment fails, the transaction aborts automatically.
   */
  public async atomicRestore(bundleData: BackupBundle['data']): Promise<void> {
    // 1. Create a safety snapshot first!
    await this.createRollbackSnapshot();

    const db = await this.getDB();
    const storesToLock = [
      STORES_REAL.ACCOUNTS,
      STORES_REAL.CATEGORIES,
      STORES_REAL.TRANSACTIONS,
      STORES_REAL.ATTACHMENTS,
      STORES_REAL.NOTES,
    ];

    return new Promise((resolve, reject) => {
      // Single atomic transaction across all real stores!
      const tx = db.transaction(storesToLock, 'readwrite');

      tx.onerror = () => {
        // Any failure causes full abort
        reject(new Error(`فشلت المعاملة الذرية للاستعادة: ${tx.error?.message || 'خطأ أثناء المعاملة'}`));
      };

      tx.onabort = () => {
        reject(new Error('تم إلغاء عملية الاستعادة الذرية وبقيت البيانات الأصلية سليمة 100%.'));
      };

      try {
        // Clear and populate all real stores within the same atomic transaction
        const accStore = tx.objectStore(STORES_REAL.ACCOUNTS);
        accStore.clear();
        (bundleData.accounts || []).forEach((item) => accStore.put(item));

        const catStore = tx.objectStore(STORES_REAL.CATEGORIES);
        catStore.clear();
        (bundleData.categories || []).forEach((item) => catStore.put(item));

        const txStore = tx.objectStore(STORES_REAL.TRANSACTIONS);
        txStore.clear();
        (bundleData.transactions || []).forEach((item) => txStore.put(item));

        const attStore = tx.objectStore(STORES_REAL.ATTACHMENTS);
        attStore.clear();
        (bundleData.attachments || []).forEach((item) => attStore.put(item));

        const noteStore = tx.objectStore(STORES_REAL.NOTES);
        noteStore.clear();
        (bundleData.notes || []).forEach((item) => noteStore.put(item));

        tx.oncomplete = () => {
          resolve();
        };
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  /**
   * Restores from the latest safety snapshot if requested.
   */
  public async restoreLatestSnapshot(): Promise<boolean> {
    const snapshots = await this.getAll<{ id: string; createdAt: string; data: BackupBundle['data'] }>(
      STORE_SNAPSHOTS
    );
    if (!snapshots || snapshots.length === 0) return false;

    // Get the most recent
    snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = snapshots[0];

    await this.atomicRestore(latest.data);
    return true;
  }
}

export const dbStorage = new IndexedDBStorage();
