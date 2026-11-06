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
  DueItemContract,
  PaymentAllocationContract,
  ReminderContract,
  UserSettings,
} from '../domain/types.ts';
import { validateTransferPairs } from '../domain/inter_account_transfer.ts';

export const DB_NAME = 'RakanBalanceDB_v2';
export const DB_VERSION = 3; // N2: due schedules, payment allocations and manual reminders

// Real workspace object stores
export const STORES_REAL = {
  ACCOUNTS: 'accounts',
  CATEGORIES: 'categories',
  TRANSACTIONS: 'transactions',
  ATTACHMENTS: 'attachments',
  NOTES: 'notes',
  SETTINGS: 'settings',
  DUES: 'dues',
  ALLOCATIONS: 'payment_allocations',
  REMINDERS: 'reminders',
} as const;

// Isolated Demo workspace object stores (completely separated from real data)
export const STORES_DEMO = {
  ACCOUNTS: 'demo_accounts',
  CATEGORIES: 'demo_categories',
  TRANSACTIONS: 'demo_transactions',
  NOTES: 'demo_notes',
  DUES: 'demo_dues',
  ALLOCATIONS: 'demo_payment_allocations',
  REMINDERS: 'demo_reminders',
} as const;

// Rollback Snapshot store
export const STORE_SNAPSHOTS = 'rollback_snapshots';

export class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbName: string;
  private dbVersion: number;

  constructor(dbName: string = DB_NAME, dbVersion: number = DB_VERSION) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }

  public getDatabaseName(): string {
    return this.dbName;
  }

  public async close(): Promise<void> {
    if (this.dbPromise) {
      try {
        const db = await this.dbPromise;
        db.close();
      } catch {
        // Ignore if already closed
      } finally {
        this.dbPromise = null;
      }
    }
  }

  public async destroyDatabase(): Promise<void> {
    // 1. Close any open connection held by this instance
    await this.close();

    // 2. Perform database deletion
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.dbName);

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        reject(
          new Error(
            `فشل حذف قاعدة البيانات "${this.dbName}": ${req.error?.message || 'خطأ أثناء الحذف'}`
          )
        );
      };

      req.onblocked = () => {
        reject(
          new Error(
            `تم حجب عملية حذف قاعدة البيانات "${this.dbName}" بسبب وجود اتصالات مفتوحة غير مغلقة.`
          )
        );
      };
    });

    // 3. Post-deletion verification check
    if (
      typeof indexedDB !== 'undefined' &&
      'databases' in indexedDB &&
      typeof indexedDB.databases === 'function'
    ) {
      try {
        const dbs = await indexedDB.databases();
        const stillExists = dbs.some((d) => d.name === this.dbName);
        if (stillExists) {
          throw new Error(
            `فشل التحقق من التنظيف: ما زالت قاعدة البيانات "${this.dbName}" موجودة بعد طلب الحذف.`
          );
        }
      } catch (verifyErr: any) {
        if (verifyErr.message && verifyErr.message.includes('فشل التحقق')) {
          throw verifyErr;
        }
      }
    }
  }

  public getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

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

        // N2 stores are additive, preserving all existing v2 records on upgrade.
        for (const name of [
          STORES_REAL.DUES, STORES_REAL.ALLOCATIONS, STORES_REAL.REMINDERS,
          STORES_DEMO.DUES, STORES_DEMO.ALLOCATIONS, STORES_DEMO.REMINDERS,
        ]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }

        // Rollback snapshots store
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // Ignore
          }
          this.dbPromise = null;
        };
        resolve(db);
      };
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
    const allocationStoreName = isDemo ? STORES_DEMO.ALLOCATIONS : STORES_REAL.ALLOCATIONS;
    const storesToLock: string[] = isDemo || (newAttachments.length === 0 && removedAttachmentIds.length === 0)
      ? [txStoreName] : [txStoreName, attStoreName];

    storesToLock.push(allocationStoreName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storesToLock, 'readwrite');
      let reason: string | null = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'تم إلغاء تعديل الحركة الذري وبقيت الحالة السابقة كما هي.'));
      tx.onerror = () => { /* Report via onabort. */ };
      const store = tx.objectStore(txStoreName);
      const getRequest = store.get(txData.id);
      getRequest.onsuccess = () => {
        try {
          const existing = getRequest.result as TransactionModel | undefined;
          if (txData.transferId || existing?.transferId) {
            throw new Error('لا يمكن تعديل قيد بيني منفردًا؛ استخدم تعديل الحركة البينية.');
          }
          const allocationReq = tx.objectStore(allocationStoreName).getAll();
          allocationReq.onsuccess = () => {
            if ((allocationReq.result as PaymentAllocationContract[]).some(a => a.paymentTransactionId === txData.id)) {
              reason = 'الحركة مرتبطة بسداد استحقاق ولا يمكن تعديلها منفردة.';
              tx.abort();
              return;
            }
            store.put(txData);
            if (!isDemo && (newAttachments.length || removedAttachmentIds.length)) {
              const attStore = tx.objectStore(attStoreName);
              for (const id of removedAttachmentIds) attStore.delete(id);
              for (const attachment of newAttachments) attStore.put(attachment);
            }
          };
          allocationReq.onerror = () => { reason = 'تعذر فحص تخصيصات السداد.'; tx.abort(); };
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
          tx.abort();
        }
      };
      getRequest.onerror = () => {
        reason = 'تعذر فحص الحركة الأصلية قبل تعديلها.';
        tx.abort();
      };
    });
  }

  /**
   * Atomically deletes an ordinary transaction and its attachments.
   * A transfer leg cannot be removed through the ordinary transaction API.
   */
  public async deleteTransactionAtomic(
    txId: string,
    attachmentIds: string[],
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const txStoreName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    const attStoreName = STORES_REAL.ATTACHMENTS;
    const allocationStoreName = isDemo ? STORES_DEMO.ALLOCATIONS : STORES_REAL.ALLOCATIONS;
    const storesToLock: string[] = isDemo || attachmentIds.length === 0
      ? [txStoreName] : [txStoreName, attStoreName];

    storesToLock.push(allocationStoreName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storesToLock, 'readwrite');
      let reason: string | null = null;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'تم إلغاء حذف الحركة الذري وبقيت البيانات دون تعديل.'));
      tx.onerror = () => { /* Report via onabort. */ };
      const store = tx.objectStore(txStoreName);
      const getRequest = store.get(txId);
      getRequest.onsuccess = () => {
        try {
          const existing = getRequest.result as TransactionModel | undefined;
          if (existing?.transferId) {
            throw new Error('لا يمكن حذف قيد بيني منفردًا؛ استخدم حذف الحركة البينية.');
          }
          const allocationReq = tx.objectStore(allocationStoreName).getAll();
          allocationReq.onsuccess = () => {
            if ((allocationReq.result as PaymentAllocationContract[]).some(a => a.paymentTransactionId === txId)) {
              reason = 'الحركة مرتبطة بسداد استحقاق ولا يمكن حذفها منفردة.';
              tx.abort();
              return;
            }
            store.delete(txId);
            if (!isDemo && attachmentIds.length) {
              const attStore = tx.objectStore(attStoreName);
              for (const id of attachmentIds) attStore.delete(id);
            }
          };
          allocationReq.onerror = () => { reason = 'تعذر فحص تخصيصات السداد.'; tx.abort(); };
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
          tx.abort();
        }
      };
      getRequest.onerror = () => {
        reason = 'تعذر فحص الحركة الأصلية قبل حذفها.';
        tx.abort();
      };
    });
  }

  // =========================================================================
  // Atomic Operations for Inter-Account Transfers (Milestone N1)
  // Ensures both sides of the transfer are saved, updated, or deleted together
  // in ONE transaction using store.add() to prevent key collisions.
  // =========================================================================

  /**
   * Atomically saves both entries of an inter-account transfer in a SINGLE transaction.
   * If saving either source or destination fails, the transaction aborts with zero partial data.
   */
  public async saveTransferAtomic(
    sourceEntry: TransactionModel,
    destinationEntry: TransactionModel,
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const txStoreName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(txStoreName, 'readwrite');

      tx.onerror = () => {
        reject(
          new Error(
            `فشلت المعاملة الذرية لتسجيل الحركة البينية: ${tx.error?.message || 'خطأ غير معروف'}`
          )
        );
      };

      tx.onabort = () => {
        reject(new Error('تم إلغاء تسجيل الحركة البينية ولم يُحفظ أي طرف جزئي منها.'));
      };

      tx.oncomplete = () => {
        resolve();
      };

      try {
        const store = tx.objectStore(txStoreName);
        // store.add guarantees rejection if ID collides, preventing accidental overwrites
        store.add(sourceEntry);
        store.add(destinationEntry);
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  /**
   * Rejects a missing or corrupt transfer pair before changing any stored record.
   * Runs inside the SAME readwrite transaction as the mutation, preventing TOCTOU.
   */
  private validateStoredTransfer(
    records: TransactionModel[],
    transferId: string
  ): TransactionModel[] {
    const pair = records.filter((entry) => entry.transferId === transferId);
    const validation = validateTransferPairs(pair);
    if (pair.length !== 2 || !validation.isValid) {
      throw new Error(
        `تعذر تعديل أو حذف الحركة البينية ${transferId}: ${validation.error || 'القيدان غير موجودين أو غير مكتملين'}.`
      );
    }
    return pair;
  }

  /**
   * Atomically updates the verified pair. Missing/corrupt transfers are NEVER upserted.
   */
  public async updateTransferAtomic(
    oldTransferId: string,
    newSourceEntry: TransactionModel,
    newDestinationEntry: TransactionModel,
    isDemo: boolean
  ): Promise<void> {
    if (
      !oldTransferId ||
      newSourceEntry.transferId !== oldTransferId ||
      newDestinationEntry.transferId !== oldTransferId ||
      !validateTransferPairs([newSourceEntry, newDestinationEntry]).isValid
    ) {
      throw new Error('بيانات طرفي الحركة البينية الجديدة غير متطابقة.');
    }

    const db = await this.getDB();
    const storeName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let reason: string | null = null;

      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'تم إلغاء تعديل الحركة البينية دون تغيير البيانات.'));
      tx.onerror = () => { /* The transaction abort handler reports the error. */ };

      const readRequest = store.getAll();
      readRequest.onsuccess = () => {
        try {
          const previousPair = this.validateStoredTransfer(
            readRequest.result as TransactionModel[],
            oldTransferId
          );
          for (const entry of previousPair) store.delete(entry.id);
          store.add(newSourceEntry);
          store.add(newDestinationEntry);
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
          tx.abort();
        }
      };
      readRequest.onerror = () => {
        reason = 'تعذر فحص القيدين الأصليين قبل تعديل الحركة البينية.';
        tx.abort();
      };
    });
  }

  /**
   * Atomically removes an existing valid pair; missing and orphaned pairs are rejected.
   */
  public async deleteTransferAtomic(transferId: string, isDemo: boolean): Promise<void> {
    if (!transferId) throw new Error('معرف الحركة البينية مفقود.');
    const db = await this.getDB();
    const storeName = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let reason: string | null = null;

      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'تم إلغاء حذف الحركة البينية دون تغيير البيانات.'));
      tx.onerror = () => { /* The transaction abort handler reports the error. */ };

      const readRequest = store.getAll();
      readRequest.onsuccess = () => {
        try {
          const pair = this.validateStoredTransfer(
            readRequest.result as TransactionModel[],
            transferId
          );
          for (const entry of pair) store.delete(entry.id);
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
          tx.abort();
        }
      };
      readRequest.onerror = () => {
        reason = 'تعذر فحص القيدين الأصليين قبل حذف الحركة البينية.';
        tx.abort();
      };
    });
  }

  /** N2: due records are purely informational and never change financial balances. */
  public async addDue(due: DueItemContract, isDemo: boolean): Promise<void> {
    const db = await this.getDB();
    const store = isDemo ? STORES_DEMO.DUES : STORES_REAL.DUES;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).add(due);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('فشل حفظ الاستحقاق.'));
      tx.onerror = () => { /* Transaction abort reports failure. */ };
    });
  }

  /** Remove an unpaid follow-up item and its manual reminders atomically. Never remove a paid item. */
  public async deleteUnpaidDueAtomic(dueId: string, isDemo: boolean): Promise<void> {
    const db = await this.getDB();
    const dueStoreName = isDemo ? STORES_DEMO.DUES : STORES_REAL.DUES;
    const allocationStoreName = isDemo ? STORES_DEMO.ALLOCATIONS : STORES_REAL.ALLOCATIONS;
    const reminderStoreName = isDemo ? STORES_DEMO.REMINDERS : STORES_REAL.REMINDERS;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([dueStoreName, allocationStoreName, reminderStoreName], 'readwrite');
      let reason = '';
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'تعذر حذف الاستحقاق دون تغيير البيانات.'));
      const dueStore = tx.objectStore(dueStoreName);
      const dueReq = dueStore.get(dueId);
      dueReq.onsuccess = () => {
        const due = dueReq.result as DueItemContract | undefined;
        if (!due || due.settledAmountMinor !== 0) { reason = 'لا يمكن حذف استحقاق غير موجود أو سبق سداده.'; tx.abort(); return; }
        const allocReq = tx.objectStore(allocationStoreName).getAll();
        allocReq.onsuccess = () => {
          if ((allocReq.result as PaymentAllocationContract[]).some(a => a.dueItemId === dueId)) {
            reason = 'الاستحقاق يحتوي على تخصيصات سداد ولا يمكن حذفه.';
            tx.abort(); return;
          }
          const remStore = tx.objectStore(reminderStoreName);
          const remReq = remStore.getAll();
          remReq.onsuccess = () => {
            for (const r of remReq.result as ReminderContract[]) {
              if (r.dueItemId === dueId) remStore.delete(r.id);
            }
            dueStore.delete(dueId);
          };
          remReq.onerror = () => { reason = 'تعذر التحقق من التذكيرات.'; tx.abort(); };
        };
        allocReq.onerror = () => { reason = 'تعذر فحص تخصيصات السداد.'; tx.abort(); };
      };
      dueReq.onerror = () => { reason = 'تعذر قراءة الاستحقاق.'; tx.abort(); };
    });
  }

  /** N2: one existing financial transaction AND one allocation, committed together. */
  public async recordDuePaymentAtomic(
    dueId: string,
    payment: TransactionModel,
    allocation: PaymentAllocationContract,
    isDemo: boolean
  ): Promise<void> {
    const db = await this.getDB();
    const dueStore = isDemo ? STORES_DEMO.DUES : STORES_REAL.DUES;
    const txStore = isDemo ? STORES_DEMO.TRANSACTIONS : STORES_REAL.TRANSACTIONS;
    const allocationStore = isDemo ? STORES_DEMO.ALLOCATIONS : STORES_REAL.ALLOCATIONS;
    const accountStore = isDemo ? STORES_DEMO.ACCOUNTS : STORES_REAL.ACCOUNTS;
    if (allocation.paymentTransactionId !== payment.id || allocation.dueItemId !== dueId ||
        allocation.amountMinor !== payment.amountMinor || payment.transferId ||
        !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0) {
      throw new Error('معلومات دفعة الاستحقاق غير متطابقة.');
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction([dueStore, txStore, allocationStore, accountStore], 'readwrite');
      let error: string | undefined;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(error || tx.error?.message || 'فشل حفظ الدفعة والتخصيص معاً.'));
      tx.onerror = () => { /* Transaction abort reports failure. */ };
      const dueRequest = tx.objectStore(dueStore).get(dueId);
      dueRequest.onsuccess = () => {
        const due = dueRequest.result as DueItemContract | undefined;
        if (!due || due.accountId !== payment.accountId || due.entryType === payment.entryType ||
            due.originalAmountMinor - due.settledAmountMinor < payment.amountMinor) {
          error = 'الدفعة تتجاوز المتبقي أو لا تطابق حساب الاستحقاق واتجاهه.';
          tx.abort();
          return;
        }
        const accountRequest = tx.objectStore(accountStore).get(payment.accountId);
        accountRequest.onsuccess = () => {
          if (!accountRequest.result || accountRequest.result.status !== 'active') {
            error = 'الحساب غير نشط أو غير موجود.';
            tx.abort();
            return;
          }
          const updatedSettled = due.settledAmountMinor + payment.amountMinor;
          tx.objectStore(dueStore).put({
            ...due,
            settledAmountMinor: updatedSettled,
            status: updatedSettled === due.originalAmountMinor ? 'settled' : 'partially_settled',
            updatedAt: new Date().toISOString(),
          });
          tx.objectStore(txStore).add(payment);
          tx.objectStore(allocationStore).add(allocation);
        };
        accountRequest.onerror = () => { error = 'تعذر التحقق من الحساب.'; tx.abort(); };
      };
      dueRequest.onerror = () => { error = 'تعذر قراءة الاستحقاق.'; tx.abort(); };
    });
  }

  /** N2: reminders are manual drafts only; no background delivery is implied. */
  public async addReminder(reminder: ReminderContract, isDemo: boolean): Promise<void> {
    const db = await this.getDB();
    const store = isDemo ? STORES_DEMO.REMINDERS : STORES_REAL.REMINDERS;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).add(reminder);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('فشل حفظ التذكير.'));
      tx.onerror = () => { /* Transaction abort reports failure. */ };
    });
  }

  public async markReminderCompleted(reminderId: string, isDemo: boolean): Promise<void> {
    const db = await this.getDB();
    const storeName = isDemo ? STORES_DEMO.REMINDERS : STORES_REAL.REMINDERS;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      let reason: string | undefined;
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error(reason || 'فشل إتمام التذكير.'));
      const req = store.get(reminderId);
      req.onsuccess = () => {
        if (!req.result) { reason = 'التذكير غير موجود.'; tx.abort(); return; }
        store.put({ ...req.result, isCompleted: true });
      };
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
        [STORES_DEMO.ACCOUNTS, STORES_DEMO.CATEGORIES, STORES_DEMO.TRANSACTIONS, STORES_DEMO.NOTES, STORES_DEMO.DUES, STORES_DEMO.ALLOCATIONS, STORES_DEMO.REMINDERS],
        'readwrite'
      );
      tx.objectStore(STORES_DEMO.ACCOUNTS).clear();
      tx.objectStore(STORES_DEMO.CATEGORIES).clear();
      tx.objectStore(STORES_DEMO.TRANSACTIONS).clear();
      tx.objectStore(STORES_DEMO.NOTES).clear();
      tx.objectStore(STORES_DEMO.DUES).clear();
      tx.objectStore(STORES_DEMO.ALLOCATIONS).clear();
      tx.objectStore(STORES_DEMO.REMINDERS).clear();

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
        [STORES_DEMO.ACCOUNTS, STORES_DEMO.CATEGORIES, STORES_DEMO.TRANSACTIONS, STORES_DEMO.NOTES, STORES_DEMO.DUES, STORES_DEMO.ALLOCATIONS, STORES_DEMO.REMINDERS],
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
      tx.objectStore(STORES_DEMO.DUES).clear();
      tx.objectStore(STORES_DEMO.ALLOCATIONS).clear();
      tx.objectStore(STORES_DEMO.REMINDERS).clear();

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
    const [accounts, categories, transactions, attachments, notes, settingsRecords, dues, allocations, reminders] = await Promise.all([
      this.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
      this.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
      this.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
      this.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
      this.getAll<StickyNoteModel>(STORES_REAL.NOTES),
      this.getAll<any>(STORES_REAL.SETTINGS),
      this.getAll<DueItemContract>(STORES_REAL.DUES),
      this.getAll<PaymentAllocationContract>(STORES_REAL.ALLOCATIONS),
      this.getAll<ReminderContract>(STORES_REAL.REMINDERS),
    ]);

    // Normalize settings records array into a clean preferences object for snapshot payload
    let settingsPayload: Partial<UserSettings> | undefined = undefined;
    if (Array.isArray(settingsRecords) && settingsRecords.length > 0) {
      const pref = settingsRecords.find((s) => s && s.key === 'user_preferences') || settingsRecords[0];
      if (pref && typeof pref === 'object') {
        const { key, ...cleanPref } = pref;
        settingsPayload = cleanPref;
      }
    }

    const snapshotId = `snapshot_${Date.now()}`;
    const snapshot = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      data: { accounts, categories, transactions, attachments, notes, dues, allocations, reminders, settings: settingsPayload },
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

    // 2. Normalize settings payload whether passed as an object or as an array
    let settingsPayload: Record<string, any> | undefined = undefined;
    if (Array.isArray(bundleData.settings)) {
      const pref = (bundleData.settings as any[]).find((s) => s && s.key === 'user_preferences') || bundleData.settings[0];
      if (pref && typeof pref === 'object') {
        const { key, ...cleanPref } = pref;
        settingsPayload = cleanPref;
      }
    } else if (bundleData.settings && typeof bundleData.settings === 'object') {
      const { key, ...cleanPref } = bundleData.settings as any;
      settingsPayload = cleanPref;
    }

    const db = await this.getDB();
    const storesToLock = [
      STORES_REAL.ACCOUNTS,
      STORES_REAL.CATEGORIES,
      STORES_REAL.TRANSACTIONS,
      STORES_REAL.ATTACHMENTS,
      STORES_REAL.NOTES,
      STORES_REAL.SETTINGS,
      STORES_REAL.DUES,
      STORES_REAL.ALLOCATIONS,
      STORES_REAL.REMINDERS,
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

        const dueStore = tx.objectStore(STORES_REAL.DUES);
        dueStore.clear();
        (bundleData.dues || []).forEach(item => dueStore.put(item));

        const allocationStore = tx.objectStore(STORES_REAL.ALLOCATIONS);
        allocationStore.clear();
        (bundleData.allocations || []).forEach(item => allocationStore.put(item));

        const reminderStore = tx.objectStore(STORES_REAL.REMINDERS);
        reminderStore.clear();
        (bundleData.reminders || []).forEach(item => reminderStore.put(item));

        const settingsStore = tx.objectStore(STORES_REAL.SETTINGS);
        settingsStore.clear();
        if (settingsPayload) {
          settingsStore.put({ key: 'user_preferences', ...settingsPayload });
        }

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

export const dbStorage = new IndexedDBStorage(DB_NAME, DB_VERSION);

/**
 * Creates an entirely isolated, dedicated test storage adapter.
 * Uses an isolated test database that NEVER intersects with production 'RakanBalanceDB_v2'.
 */
export function createIsolatedTestStorage(customName?: string): IndexedDBStorage {
  const testDbName =
    customName || `RakanBalance_TestIsolatedDB_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  return new IndexedDBStorage(testDbName, DB_VERSION);
}
