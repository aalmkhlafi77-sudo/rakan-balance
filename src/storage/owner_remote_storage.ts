/**
 * Owner-only memory adapter: API is the sole durable data source.
 * NEVER reads/writes the public visitor's IndexedDB or localStorage.
 * All changes are full-ledger server-validated atomic CAS commits.
 *
 * This first implementation supports a bounded snapshot payload.
 * Large attachments and advanced import history remain blocked until migrated.
 */
import type {
  AccountModel, AttachmentModel, BackupBundle, CategoryModel, DueItemContract,
  PaymentAllocationContract, ReminderContract, StickyNoteModel, TransactionModel,
} from '../domain/types.ts';
import { STORES_REAL } from './indexed_db.ts';
import { computeSHA256 } from './backup_service.ts';
import type { LedgerImportPreview, LedgerImportCommitResult } from '../domain/web_ledger_import.ts';

type LedgerData = BackupBundle['data'] & {
  accounts: AccountModel[];
  categories: CategoryModel[];
  transactions: TransactionModel[];
  attachments: AttachmentModel[];
  notes: StickyNoteModel[];
  dues: DueItemContract[];
  allocations: PaymentAllocationContract[];
  reminders: ReminderContract[];
};
const TABLES: Record<string, keyof LedgerData> = {
  [STORES_REAL.ACCOUNTS]: 'accounts',
  [STORES_REAL.CATEGORIES]: 'categories',
  [STORES_REAL.TRANSACTIONS]: 'transactions',
  [STORES_REAL.ATTACHMENTS]: 'attachments',
  [STORES_REAL.NOTES]: 'notes',
  [STORES_REAL.DUES]: 'dues',
  [STORES_REAL.ALLOCATIONS]: 'allocations',
  [STORES_REAL.REMINDERS]: 'reminders',
};
const emptyData = (): LedgerData => ({
  accounts: [], categories: [], transactions: [], attachments: [], notes: [],
  dues: [], allocations: [], reminders: [],
});
function copy<T>(x: T): T { return structuredClone(x); }
function failIfDemo(isDemo: boolean): void {
  if (isDemo) throw new Error('لا توجد بيانات تجريبية في مساحة المالك.');
}
function verifyUnique(items: { id: string }[], id: string): void {
  if (items.some((x) => x.id === id)) throw new Error('هذا المعرف موجود بالفعل.');
}
function ensureOwnerAttachmentSupported(files: AttachmentModel[]): void {
  if (files.some(file => file.mimeType === 'image/svg+xml')) {
    throw new Error('لأمان مساحة المالك، ملفات SVG غير مدعومة. استخدم PNG أو JPG أو WEBP أو GIF أو PDF.');
  }
}

export class OwnerRemoteStorage {
  private data: LedgerData = emptyData();
  private revision = 0;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private csrf: () => string) {}

  private async request(path: string, init?: RequestInit) {
    let response: Response;
    try {
      response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init });
    } catch {
      throw new Error('تعذر الاتصال بالخادم. لم يتم حفظ التعديل.');
    }
    if (response.status === 401) {
      window.dispatchEvent(new Event('rakan-owner-session-expired'));
      throw new Error('انتهت جلسة المالك. يجب إعادة تسجيل الدخول.');
    }
    return response;
  }

  private async fetchCurrent(): Promise<void> {
    const response = await this.request('/api/owner/ledger');
    if (!response.ok) throw new Error('تعذر تحميل بيانات المالك الخاصة.');
    const info = await response.json() as { revision: number; bundle: BackupBundle | null };
    if (!Number.isSafeInteger(info.revision) || info.revision < 0) throw new Error('إصدار بيانات المالك غير صالح.');
    const from = info.bundle?.data || emptyData();
    const data: LedgerData = {
      accounts: copy(from.accounts || []),
      categories: copy(from.categories || []),
      transactions: copy(from.transactions || []),
      attachments: copy(from.attachments || []),
      notes: copy(from.notes || []),
      dues: copy(from.dues || []),
      allocations: copy(from.allocations || []),
      reminders: copy(from.reminders || []),
    };
    if (from.settings) data.settings = copy(from.settings);
    this.data = data;
    this.revision = info.revision;
    this.loaded = true;
  }

  public async load(): Promise<void> {
    if (this.loaded) return;
    if (!this.loading) {
      this.loading = this.fetchCurrent().finally(() => { this.loading = null; });
    }
    await this.loading;
  }

  public async refreshIfChanged(): Promise<boolean> {
    await this.chain.catch(() => {});
    await this.load();
    const previous = this.revision;
    await this.fetchCurrent();
    return this.revision !== previous;
  }

  public async getSafeSettings(): Promise<BackupBundle['data']['settings'] | null> {
    await this.load();
    return this.data.settings ? copy(this.data.settings) : null;
  }

  public async getAll<T>(storeName: string): Promise<T[]> {
    await this.load();
    const name = TABLES[storeName];
    if (!name) throw new Error('مخزن غير مسموح في مساحة المالك.');
    return copy((this.data[name] || []) as T[]);
  }

  private async bundle(d: LedgerData): Promise<BackupBundle> {
    const orderedData: BackupBundle['data'] = {
      accounts: d.accounts,
      categories: d.categories,
      transactions: d.transactions,
      attachments: d.attachments,
      notes: d.notes,
      dues: d.dues,
      allocations: d.allocations,
      reminders: d.reminders,
    };
    if (d.settings) orderedData.settings = d.settings;
    const checksum = await computeSHA256(JSON.stringify(orderedData));
    return {
      manifest: {
        formatName: 'RAKAN_BALANCE_BACKUP',
        backupFormatVersion: 2, schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        appName: 'RAKAN BALANCE',
        checksum,
        recordCounts: {
          accounts: d.accounts.length,
          categories: d.categories.length,
          transactions: d.transactions.length,
          attachments: d.attachments.length,
          notes: d.notes.length,
          dues: d.dues.length,
          allocations: d.allocations.length,
          reminders: d.reminders.length,
        },
      },
      data: orderedData,
    };
  }

  private async change(mutator: (draft: LedgerData) => void): Promise<void> {
    const action = this.chain.catch(() => {}).then(async () => {
      await this.load();
      const draft = copy(this.data);
      mutator(draft);
      const bundle = await this.bundle(draft);
      const response = await this.request('/api/owner/ledger', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': this.csrf(),
        },
        body: JSON.stringify({ expectedRevision: this.revision, bundle }),
      });
      if (response.status === 409) {
        window.dispatchEvent(new Event('rakan-owner-ledger-conflict'));
        throw new Error('حُدّثت البيانات من جهاز آخر. لم يُحفظ تعديلك؛ أعد تحميل البيانات أولاً.');
      }
      if (response.status === 422) {
        throw new Error('رفض الخادم التعديل لعدم اجتيازه فحص سلامة البيانات المالية.');
      }
      if (!response.ok) {
        throw new Error('فشل حفظ بيانات المالك على الخادم. لم يُعتمد التعديل.');
      }
      const receipt = await response.json() as { revision: number };
      if (receipt.revision !== this.revision + 1) {
        throw new Error('لم يمكن تأكيد إصدار عملية الحفظ. يُرجى تحديث البيانات قبل الاستمرار.');
      }
      this.revision = receipt.revision;
      // Match the authoritative server representation immediately so later
      // financial writes never resend large Base64 files inside the ledger JSON.
      for (const attachment of draft.attachments) {
        if (attachment.dataUrl.startsWith('data:')) {
          attachment.dataUrl = 'rakan-private://attachment/' + attachment.id;
        }
      }
      this.data = draft;
    });
    this.chain = action.catch(() => {});
    await action;
  }

  public async put<T extends { id: string }>(storeName: string, item: T): Promise<void> {
    const name = TABLES[storeName];
    if (!name) throw new Error('مخزن غير مسموح.');
    await this.change((d) => {
      const list = d[name] as { id: string }[];
      const idx = list.findIndex((x) => x.id === item.id);
      if (idx >= 0) list[idx] = copy(item); else list.push(copy(item));
    });
  }
  public async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const name = TABLES[storeName];
    if (!name) throw new Error('مخزن غير مسموح.');
    await this.change((d) => {
      const list = d[name] as { id: string }[];
      d[name] = list.filter((x) => x.id !== String(key)) as never;
    });
  }
  public async saveTransactionAtomic(item: TransactionModel, files: AttachmentModel[], demo: boolean) {
    failIfDemo(demo);
    ensureOwnerAttachmentSupported(files);
    await this.change(d => {
      verifyUnique(d.transactions, item.id);
      for (const f of files) verifyUnique(d.attachments, f.id);
      d.transactions.push(copy(item));
      d.attachments.push(...copy(files));
    });
  }
  public async updateTransactionAtomic(item: TransactionModel, files: AttachmentModel[], removed: string[], demo: boolean) {
    failIfDemo(demo);
    ensureOwnerAttachmentSupported(files);
    await this.change(d => {
      const idx = d.transactions.findIndex(t => t.id === item.id);
      if (idx < 0 || d.transactions[idx].transferId) throw new Error('الحركة غير موجودة أو لا يمكن تعديل طرف حركة بينية.');
      if (d.allocations.some(a => a.paymentTransactionId === item.id)) throw new Error('الدفعة مرتبطة باستحقاق.');
      d.transactions[idx] = copy(item);
      d.attachments = d.attachments.filter(f => !removed.includes(f.id));
      d.attachments.push(...copy(files));
    });
  }
  public async deleteTransactionAtomic(id: string, attachments: string[], demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      const item = d.transactions.find(t => t.id === id);
      if (!item || item.transferId || d.allocations.some(a => a.paymentTransactionId === id)) {
        throw new Error('لا يمكن حذف الحركة أو طرف حركة بينية أو دفعة مرتبطة باستحقاق.');
      }
      d.transactions = d.transactions.filter(t => t.id !== id);
      d.attachments = d.attachments.filter(f => !attachments.includes(f.id));
    });
  }
  public async saveTransferAtomic(a: TransactionModel, b: TransactionModel, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      verifyUnique(d.transactions, a.id); verifyUnique(d.transactions, b.id);
      d.transactions.push(copy(a), copy(b));
    });
  }
  public async updateTransferAtomic(id: string, a: TransactionModel, b: TransactionModel, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      if (d.transactions.filter(t => t.transferId === id).length !== 2) throw new Error('طرفا الحركة البينية غير مكتملين.');
      d.transactions = d.transactions.filter(t => t.transferId !== id);
      d.transactions.push(copy(a), copy(b));
    });
  }
  public async deleteTransferAtomic(id: string, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      if (d.transactions.filter(t => t.transferId === id).length !== 2) throw new Error('طرفا الحركة البينية غير مكتملين.');
      d.transactions = d.transactions.filter(t => t.transferId !== id);
    });
  }
  public async addDue(due: DueItemContract, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => { verifyUnique(d.dues, due.id); d.dues.push(copy(due)); });
  }
  public async deleteUnpaidDueAtomic(id: string, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      const due = d.dues.find(x => x.id === id);
      if (!due || due.settledAmountMinor !== 0 ||
          d.allocations.some(x => x.dueItemId === id)) throw new Error('لا يمكن حذف استحقاق سبق سداده.');
      d.dues = d.dues.filter(x => x.id !== id);
      d.reminders = d.reminders.filter(x => x.dueItemId !== id);
    });
  }
  public async recordDuePaymentAtomic(id: string, payment: TransactionModel, allocation: PaymentAllocationContract, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      const due = d.dues.find(x => x.id === id);
      if (!due || due.accountId !== payment.accountId || due.entryType === payment.entryType ||
          due.originalAmountMinor - due.settledAmountMinor < payment.amountMinor ||
          allocation.paymentTransactionId !== payment.id || allocation.dueItemId !== id ||
          allocation.amountMinor !== payment.amountMinor) throw new Error('معلومات تخصيص السداد غير صالحة.');
      verifyUnique(d.transactions, payment.id); verifyUnique(d.allocations, allocation.id);
      d.transactions.push(copy(payment));
      d.allocations.push(copy(allocation));
      due.settledAmountMinor += payment.amountMinor;
      due.status = due.settledAmountMinor === due.originalAmountMinor ? 'settled' : 'partially_settled';
      due.updatedAt = new Date().toISOString();
    });
  }
  public async addReminder(reminder: ReminderContract, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => { verifyUnique(d.reminders, reminder.id); d.reminders.push(copy(reminder)); });
  }
  public async markReminderCompleted(id: string, demo: boolean) {
    failIfDemo(demo);
    await this.change(d => {
      const reminder = d.reminders.find(x => x.id === id);
      if (!reminder) throw new Error('التذكير غير موجود.');
      reminder.isCompleted = true;
    });
  }
  public async updateOwnerPreferences(name: string, currency: {
    code: string; symbol: string; name: string;
  }): Promise<void> {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) throw new Error('اسم المالك يجب أن يكون بين 1 و100 حرف.');
    await this.change((d) => {
      const oldCurrency = d.settings?.currencyCode || 'SAR';
      if (oldCurrency !== currency.code &&
          (d.transactions.length > 0 || d.accounts.some(a => a.openingBalanceMinor !== 0))) {
        throw new Error('لا يمكن تغيير العملة بعد وجود أرصدة أو حركات مالية.');
      }
      d.settings = {
        ownerName: cleanName,
        currencyCode: currency.code,
        currencySymbol: currency.symbol,
        currencyName: currency.name,
        currencyDecimals: 2,
        isFirstSetupDone: true,
      };
    });
  }
  public async atomicRestore(data: BackupBundle['data']) {
    await this.change(d => {
      const copyData = copy(data);
      Object.assign(d, emptyData(), copyData);
    });
  }
  public async restoreLatestSnapshot(): Promise<boolean> {
    throw new Error('الرجوع إلى نسخة المالك السابقة متوقف حتى تفعيل نسخ الخادم التاريخية.');
  }
  public async importLedgerAtomic(preview: LedgerImportPreview, scope: 'real' | 'demo'): Promise<LedgerImportCommitResult> {
    if (scope !== 'real') throw new Error('لا يمكن الاستيراد إلى مساحة تجريبية للمالك.');
    if (!preview.canCommit) throw new Error('لا يمكن استيراد ملف يحتوي على أخطاء مانعة.');
    const norm = (val: unknown) => String(val ?? '').trim().toLowerCase()
      .replace(/\uFEFF/g, '').replace(/[\s_\-]+/g, '');
    const result: LedgerImportCommitResult = {
      importedAccounts: 0, skippedAccounts: 0, importedTransactions: 0, skippedTransactions: 0,
    };
    await this.change((d) => {
      const categories = new Map(d.categories.map(c => [norm(c.name), c.id]));
      const accountsByName = new Map(d.accounts.map(a => [norm(a.name), a.id]));
      const accountsById = new Map(d.accounts.map(a => [norm(a.id), a.id]));
      const externalRefs = new Map<string, string>();
      const signatures = new Set(d.transactions.map(t =>
        [norm(t.accountId), t.entryType, t.amountMinor, t.date, t.description.trim()].join('|')));
      const stamp = new Date().toISOString();
      for (const item of preview.accounts) {
        const key = norm(item.name);
        const existing = accountsByName.get(key);
        if (item.duplicate || existing) {
          if (existing && item.externalRef) externalRefs.set(norm(item.externalRef), existing);
          result.skippedAccounts += 1;
          continue;
        }
        const categoryName = item.categoryName.trim();
        const categoryKey = norm(categoryName);
        let categoryId = categories.get(categoryKey);
        if (!categoryId) {
          categoryId = crypto.randomUUID();
          d.categories.push({ id: categoryId, name: categoryName, sortOrder: d.categories.length + 1 });
          categories.set(categoryKey, categoryId);
        }
        const id = crypto.randomUUID();
        d.accounts.push({
          id, name: item.name.trim(), parentId: null, categoryId,
          openingBalanceMinor: item.openingBalanceMinor, status: 'active',
          phone: item.phone?.trim(), notes: item.notes?.trim(),
          isDemo: false, createdAt: stamp, updatedAt: stamp,
        });
        accountsByName.set(key, id);
        accountsById.set(norm(id), id);
        if (item.externalRef) externalRefs.set(norm(item.externalRef), id);
        result.importedAccounts += 1;
      }
      for (const item of preview.transactions) {
        if (item.duplicate) { result.skippedTransactions += 1; continue; }
        const ref = norm(item.accountRef);
        const accountId = accountsById.get(ref) || externalRefs.get(ref) || accountsByName.get(ref);
        if (!accountId) throw new Error('تعذر ربط الحركة في الصف ' + item.sourceRow + ' بحساب معروف.');
        const signature = [norm(accountId), item.entryType, item.amountMinor, item.date, item.description.trim()].join('|');
        if (signatures.has(signature)) { result.skippedTransactions += 1; continue; }
        signatures.add(signature);
        d.transactions.push({
          id: crypto.randomUUID(), accountId, entryType: item.entryType,
          amountMinor: item.amountMinor, date: item.date,
          description: item.description.trim(), notes: item.notes?.trim(),
          attachmentIds: [], isDemo: false, createdAt: stamp, updatedAt: stamp,
        });
        result.importedTransactions += 1;
      }
    });
    return result;
  }
  public async saveDemoWorkspace(): Promise<never> {
    throw new Error('وضع الاختبار غير متاح في مساحة المالك.');
  }
  public async purgeDemoWorkspace(): Promise<never> {
    throw new Error('وضع الاختبار غير متاح في مساحة المالك.');
  }
}
