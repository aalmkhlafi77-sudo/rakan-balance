import { expect, test } from '@playwright/test';
import { computeSHA256, validateBackupFile } from '../src/storage/backup_service.ts';
import type { AccountModel, BackupBundle, CategoryModel, DueItemContract, ReminderContract } from '../src/domain/types.ts';

const categories: CategoryModel[] = [{ id: 'cat-1', name: 'عملاء', sortOrder: 1 }];
const accounts: AccountModel[] = [{
  id: 'acc-1', name: 'عميل تجريبي', parentId: null, categoryId: 'cat-1',
  openingBalanceMinor: 30000, status: 'active',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}];
const dues: DueItemContract[] = [{
  id: 'due-1', accountId: 'acc-1', entryType: 'owedByAccount',
  dueDate: '2026-12-30', originalAmountMinor: 10000,
  settledAmountMinor: 0, status: 'pending',
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
}];
const reminders: ReminderContract[] = [{
  id: 'reminder-1', dueItemId: 'due-1', remindAt: '2026-12-20',
  templateText: 'تذكير يدوي', isCompleted: false, channel: 'manual',
}];

async function bundleFor(data: BackupBundle['data']): Promise<string> {
  const manifest: BackupBundle['manifest'] = {
    formatName: 'RAKAN_BALANCE_BACKUP', backupFormatVersion: 2,
    schemaVersion: 2, exportedAt: '2026-11-07T00:00:00Z',
    appName: 'راكان بلانس | RAKAN BALANCE',
    checksum: await computeSHA256(JSON.stringify(data)),
    recordCounts: {
      accounts: data.accounts.length, categories: data.categories.length,
      transactions: data.transactions.length, attachments: data.attachments.length,
      notes: data.notes.length,
      ...(data.dues !== undefined ? { dues: data.dues.length } : {}),
      ...(data.allocations !== undefined ? { allocations: data.allocations.length } : {}),
      ...(data.reminders !== undefined ? { reminders: data.reminders.length } : {}),
    },
  };
  return JSON.stringify({ manifest, data });
}

test('N2 backup: accept new follow-up records, reject corrupt hashes and orphan reminders', async () => {
  const data: BackupBundle['data'] = { accounts, categories, transactions: [], attachments: [], notes: [], dues, allocations: [], reminders };
  const original = await bundleFor(data);
  const valid = await validateBackupFile(original);
  expect(valid.isValid, valid.error).toBe(true);
  expect(valid.bundle?.data.dues).toHaveLength(1);
  const brokenCounts = JSON.parse(original);
  brokenCounts.manifest.recordCounts.dues = 2;
  expect((await validateBackupFile(JSON.stringify(brokenCounts))).isValid).toBe(false);
  const orphan = { ...data, reminders: [{ ...reminders[0], dueItemId: 'missing-due' }] };
  expect((await validateBackupFile(await bundleFor(orphan))).isValid).toBe(false);
  const brokenChecksum = JSON.parse(original);
  brokenChecksum.data.dues[0].originalAmountMinor = 1;
  expect((await validateBackupFile(JSON.stringify(brokenChecksum))).isValid).toBe(false);
});

test('N2 backup: accept valid legacy N1 payload without follow-up fields', async () => {
  const legacy: BackupBundle['data'] = { accounts, categories, transactions: [], attachments: [], notes: [] };
  const result = await validateBackupFile(await bundleFor(legacy));
  expect(result.isValid, result.error).toBe(true);
});
