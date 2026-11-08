import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwnerRemoteStorage } from '../src/storage/owner_remote_storage.ts';
import { validateBackupFile } from '../src/storage/backup_service.ts';
import { STORES_REAL } from '../src/storage/indexed_db.ts';
import { LedgerImportPreview } from '../src/domain/web_ledger_import.ts';

test('owner storage commits only to validated server, never to IndexedDB; stale writes fail without local mutation', async () => {
  const initialFetch = globalThis.fetch;
  const initialWindow = globalThis.window;
  const initialDb = globalThis.indexedDB;
  let revision = 0;
  let serverBundle: any = null;
  (globalThis as any).window = new EventTarget();
  (globalThis as any).indexedDB = {
    open() { throw new Error('Private owner session must NEVER open visitor IndexedDB'); },
  };
  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    if (url !== '/api/owner/ledger') throw new Error('Unexpected route: ' + url);
    if (!init.method || init.method === 'GET') {
      return new Response(JSON.stringify({ revision, bundle: serverBundle }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(init.method, 'PUT');
    assert.equal((init.headers as any)['x-csrf-token'], 'secret-csrf-in-memory');
    const data = JSON.parse(init.body as string);
    if (data.expectedRevision !== revision) return new Response(JSON.stringify({ currentRevision: revision }), { status: 409 });
    const result = await validateBackupFile(JSON.stringify(data.bundle));
    if (!result.isValid) return new Response(JSON.stringify({ error: result.error }), { status: 422 });
    serverBundle = structuredClone(data.bundle);
    revision += 1;
    return new Response(JSON.stringify({ revision }), { status: 200 });
  };
  try {
    const storage = new OwnerRemoteStorage(() => 'secret-csrf-in-memory');
    assert.deepEqual(await storage.getAll(STORES_REAL.ACCOUNTS), []);
    const category = { id: 'category-owner-1', name: 'المالك', sortOrder: 1 };
    await storage.put(STORES_REAL.CATEGORIES, category);
    assert.equal(revision, 1);
    const account = {
      id: 'owner-account-1', name: 'حساب سري', categoryId: category.id,
      parentId: null, openingBalanceMinor: 10000, status: 'active' as const,
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    };
    await storage.put(STORES_REAL.ACCOUNTS, account);
    assert.equal(revision, 2);
    const tx = {
      id: 'owner-tx-1', accountId: account.id,
      entryType: 'owedByAccount' as const, amountMinor: 250,
      date: '2026-11-08', description: 'اختبار آمن', attachmentIds: [],
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    };
    await storage.saveTransactionAtomic(tx, [], false);
    assert.equal(revision, 3);
    assert.equal((await storage.getAll(STORES_REAL.TRANSACTIONS)).length, 1);
    assert.equal(serverBundle.data.transactions[0].amountMinor, 250);

    revision += 1; // Another device has committed a newer revision.
    await assert.rejects(() => storage.put(STORES_REAL.ACCOUNTS, { ...account, name: 'تعديل متأخر' }), /جهاز آخر/);
    assert.equal((await storage.getAll<typeof account>(STORES_REAL.ACCOUNTS))[0].name, 'حساب سري');
    assert.equal(revision, 4);
    const secondDevice = new OwnerRemoteStorage(() => 'secret-csrf-in-memory');
    await secondDevice.load();
    const imported = await secondDevice.importLedgerAtomic(new LedgerImportPreview({
      sourceName: 'accounts.xlsx',
      accounts: [{
        sourceRow: 2, name: 'حساب مستورد', categoryName: 'المالك',
        openingBalanceMinor: 0, duplicate: false,
      }],
      transactions: [], issues: [],
    }), 'real');
    assert.equal(imported.importedAccounts, 1);
    assert.equal(revision, 5);
    await secondDevice.updateOwnerPreferences('مالك الحساب', {
      code: 'SAR', symbol: 'ر.س', name: 'ريال سعودي',
    });
    assert.equal(revision, 6);
    await assert.rejects(() => secondDevice.updateOwnerPreferences('مالك الحساب', {
      code: 'USD', symbol: '$', name: 'دولار أمريكي',
    }), /العملة/);
    assert.equal(revision, 6);
  } finally {
    globalThis.fetch = initialFetch;
    (globalThis as any).window = initialWindow;
    (globalThis as any).indexedDB = initialDb;
  }
});
