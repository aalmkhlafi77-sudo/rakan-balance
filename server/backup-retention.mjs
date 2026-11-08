import { readdir, unlink } from 'node:fs/promises';

const MANAGED = /^rakan-owner-(\d{8}T\d{6}Z)-([a-f0-9]{8})\.rbe$/;

export function scheduledBackupFilename(date, suffix) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !/^[a-f0-9]{8}$/.test(suffix)) {
    throw new Error('Invalid scheduled backup filename input');
  }
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return 'rakan-owner-' + stamp + '-' + suffix + '.rbe';
}

export async function listManagedBackups(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && MANAGED.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse();
}

export async function pruneManagedBackups(directory, retentionCount) {
  if (!Number.isInteger(retentionCount) || retentionCount < 1 || retentionCount > 365) {
    throw new Error('Backup retention count must be between 1 and 365');
  }
  const managed = await listManagedBackups(directory);
  const removed = [];
  for (const name of managed.slice(retentionCount)) {
    await unlink(directory + '/' + name);
    removed.push(name);
  }
  return { retained: managed.slice(0, retentionCount), removed };
}
