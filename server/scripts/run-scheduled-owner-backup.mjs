import path from 'node:path';
import { constants, copyFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabasePool } from '../db.mjs';
import { pruneManagedBackups, scheduledBackupFilename } from '../backup-retention.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BACKUP_CLI = fileURLToPath(new URL('./owner-backup.mjs', import.meta.url));

function protectedDirectory(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(label + ' must be an absolute private directory');
  const resolved = path.resolve(value);
  if (resolved === PROJECT_ROOT || resolved.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(label + ' must be outside the application directory');
  }
  return resolved;
}

function retentionCount() {
  const value = Number(process.env.RAKAN_BACKUP_RETENTION_COUNT || 14);
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new Error('RAKAN_BACKUP_RETENTION_COUNT must be between 1 and 365');
  }
  return value;
}

function runBackupCli(action, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [BACKUP_CLI, action, filePath],
      { env: process.env, stdio: ['ignore', 'ignore', 'ignore'] },
    );
    child.once('error', () => reject(new Error('Backup subprocess failed to start')));
    child.once('exit', code => code === 0
      ? resolve()
      : reject(new Error('Backup subprocess failed validation')));
  });
}

async function main() {
  if (!process.env.RAKAN_BACKUP_PASSPHRASE || process.env.RAKAN_BACKUP_PASSPHRASE.length < 20) {
    throw new Error('RAKAN_BACKUP_PASSPHRASE is required');
  }
  const directory = protectedDirectory(process.env.RAKAN_BACKUP_DIR, 'RAKAN_BACKUP_DIR');
  const mirror = process.env.RAKAN_BACKUP_MIRROR_DIR
    ? protectedDirectory(process.env.RAKAN_BACKUP_MIRROR_DIR, 'RAKAN_BACKUP_MIRROR_DIR')
    : null;
  const keep = retentionCount();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (mirror) await mkdir(mirror, { recursive: true, mode: 0o700 });

  const pool = createDatabasePool();
  let locked = false;
  let target = null;
  let mirrorTarget = null;
  let primaryVerified = false;
  try {
    const [rows] = await pool.query(
      "SELECT GET_LOCK('rakan_balance_owner_backup_scheduler', 0) AS acquired",
    );
    if (Number(rows?.[0]?.acquired) !== 1) {
      throw new Error('Another owner backup is already running');
    }
    locked = true;

    const name = scheduledBackupFilename(new Date(), randomBytes(4).toString('hex'));
    target = path.join(directory, name);
    await runBackupCli('export', target);
    await runBackupCli('verify', target);
    await chmod(target, 0o600);
    primaryVerified = true;

    if (mirror) {
      mirrorTarget = path.join(mirror, name);
      await copyFile(target, mirrorTarget, constants.COPYFILE_EXCL);
      await chmod(mirrorTarget, 0o600);
      await runBackupCli('verify', mirrorTarget);
      await pruneManagedBackups(mirror, keep);
    }
    await pruneManagedBackups(directory, keep);
    process.stdout.write('Scheduled encrypted owner backup completed and verified.\n');
  } catch (error) {
    if (mirrorTarget) {
      try { await unlink(mirrorTarget); } catch { /* keep original failure */ }
    }
    if (target && !primaryVerified) {
      try { await unlink(target); } catch { /* keep original failure */ }
    }
    throw error;
  } finally {
    if (locked) {
      try { await pool.query("SELECT RELEASE_LOCK('rakan_balance_owner_backup_scheduler')"); } catch {}
    }
    await pool.end();
  }
}

main().catch(() => {
  console.error('Scheduled owner backup failed; inspect protected operator logs.');
  process.exitCode = 1;
});
