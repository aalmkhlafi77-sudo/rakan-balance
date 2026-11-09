import { createDatabasePool } from '../db.mjs';
import { hashPassword, ensureStrongPassword } from '../security.mjs';

// One-time administrative CLI; no endpoint for public registration or reset.
// Pass RAKAN_OWNER_PASSWORD only through a protected temporary environment
// variable (never commit it, print it, or include it in application build).
async function main() {
  const password = process.env.RAKAN_OWNER_PASSWORD;
  ensureStrongPassword(password);
  const pool = createDatabasePool();
  try {
    const [existing] = await pool.execute('SELECT id FROM owner_credentials WHERE id = 1 LIMIT 1');
    if (existing.length !== 0) throw new Error('Owner already provisioned; no overwrite allowed');
    const encoded = await hashPassword(password);
    await pool.execute('INSERT INTO owner_credentials (id, password_hash) VALUES (1, ?)', [encoded]);
    process.stdout.write('Owner provisioned successfully.\n');
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error('Provisioning failed:', error.message);
  process.exitCode = 1;
});
