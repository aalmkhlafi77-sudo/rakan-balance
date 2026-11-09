import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scheduledBackupFilename, listManagedBackups, pruneManagedBackups } from '../backup-retention.mjs';

test('scheduled backup filenames are sortable and retention deletes only managed archives', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rakan-backups-'));
  try {
    const names = [
      scheduledBackupFilename(new Date('2026-11-07T01:02:03Z'), 'aaaaaaaa'),
      scheduledBackupFilename(new Date('2026-11-08T01:02:03Z'), 'bbbbbbbb'),
      scheduledBackupFilename(new Date('2026-11-09T01:02:03Z'), 'cccccccc'),
    ];
    for (const name of names) await writeFile(path.join(dir, name), 'encrypted-test');
    await writeFile(path.join(dir, 'do-not-delete.txt'), 'operator-file');

    assert.deepEqual(await listManagedBackups(dir), [names[2], names[1], names[0]]);
    const result = await pruneManagedBackups(dir, 2);
    assert.deepEqual(result.retained, [names[2], names[1]]);
    assert.deepEqual(result.removed, [names[0]]);
    const remaining = await readdir(dir);
    assert.ok(remaining.includes('do-not-delete.txt'));
    assert.ok(remaining.includes(names[2]) && remaining.includes(names[1]));
    assert.ok(!remaining.includes(names[0]));
    await assert.rejects(() => pruneManagedBackups(dir, 0), /between 1 and 365/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
