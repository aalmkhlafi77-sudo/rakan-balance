import { readFile, writeFile } from 'node:fs/promises';
import { createDatabasePool } from '../db.mjs';
import { encryptOwnerBackup, decryptOwnerBackup } from '../backup-crypto.mjs';
import { createHash } from 'node:crypto';
import { validateBackupFile } from '../generated/owner-validator.mjs';

// Operational tool ONLY; no HTTP routes. Never restore to production.
// RAKAN_RESTORE_TEST_ONLY=1 and an isolated database name containing "test"
// are mandatory for restore. No overwrite; target snapshot must be revision 0.
async function main() {
  const [action, filePath] = process.argv.slice(2);
  if (!['export', 'verify', 'restore-test'].includes(action) || !filePath) {
    throw new Error('Usage: node server/scripts/owner-backup.mjs <export|verify|restore-test> <file>');
  }
  const passphrase = process.env.RAKAN_BACKUP_PASSPHRASE;
  const pool = action === 'verify' ? null : createDatabasePool();
  try {
    if (action === 'export') {
      const [rows] = await pool.execute(
        'SELECT revision, payload, payload_sha256 FROM owner_ledger_snapshot WHERE id = 1 LIMIT 1',
      );
      if (rows.length !== 1 || rows[0].payload === null) {
        throw new Error('Owner ledger is not initialized or is empty');
      }
      const raw = Buffer.isBuffer(rows[0].payload) ? rows[0].payload : Buffer.from(rows[0].payload);
      const revision = Number(rows[0].revision);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Unsafe owner ledger revision');
      const checksum = createHash('sha256').update(raw).digest('hex');
      if (checksum !== rows[0].payload_sha256) throw new Error('Owner ledger checksum mismatch');
      const validation = await validateBackupFile(raw.toString('utf8'));
      if (!validation.isValid) throw new Error('Owner ledger validation failed');
      const encrypted = await encryptOwnerBackup({ revision, payload: raw.toString('utf8') }, passphrase);
      // wx never overwrites existing backups; owner should secure the destination.
      await writeFile(filePath, encrypted, { flag: 'wx', mode: 0o600 });
      process.stdout.write('Encrypted owner backup exported.\n');
      return;
    }
    const encrypted = await readFile(filePath, 'utf8');
    const snapshot = await decryptOwnerBackup(encrypted, passphrase);
    if (snapshot.payload !== null) {
      const validation = await validateBackupFile(snapshot.payload);
      if (!validation.isValid) throw new Error('Decrypted financial snapshot failed validation');
    }
    if (action === 'verify') {
      process.stdout.write('Encrypted backup integrity and financial schema verified.\n');
      return;
    }
    const dbName = process.env.DB_NAME || '';
    if (process.env.RAKAN_RESTORE_TEST_ONLY !== '1' ||
        !/test|staging|restore/i.test(dbName) || /prod|live/i.test(dbName)) {
      throw new Error('Restore is restricted to an explicitly isolated test/staging database');
    }
    if (snapshot.payload === null) throw new Error('Refusing to restore an empty snapshot');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT revision, payload FROM owner_ledger_snapshot WHERE id = 1 FOR UPDATE',
      );
      if (rows.length !== 1 || Number(rows[0].revision) !== 0 || rows[0].payload !== null) {
        throw new Error('Test restore requires an empty revision-0 target');
      }
      const payload = Buffer.from(snapshot.payload, 'utf8');
      const sha = createHash('sha256').update(payload).digest('hex');
      await connection.execute(
        'UPDATE owner_ledger_snapshot SET revision = ?, payload = ?, payload_sha256 = ? WHERE id = 1',
        [snapshot.revision, payload, sha],
      );
      await connection.commit();
      process.stdout.write('Verified owner backup restored to an empty test database.\n');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } finally {
    await pool?.end();
  }
}
main().catch((error) => {
  // Never print secrets, payloads, filesystem paths or connection strings.
  console.error('Owner backup operation failed; inspect protected operator logs.');
  process.exitCode = 1;
});
