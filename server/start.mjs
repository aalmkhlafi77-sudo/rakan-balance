import { createDatabasePool } from './db.mjs';
import { createApp } from './app.mjs';
import { canonicalOrigin } from './security.mjs';

async function main() {
  canonicalOrigin(process.env.APP_ORIGIN);
  const pool = createDatabasePool();
  // Fail closed if host credentials are invalid or phase-A migrations are missing.
  await pool.query('SELECT 1 FROM owner_credentials LIMIT 1');
  await pool.query('SELECT 1 FROM owner_sessions LIMIT 1');
  await pool.query('SELECT 1 FROM owner_ledger_snapshot LIMIT 1');
  await pool.query('SELECT 1 FROM owner_login_limits LIMIT 1');
  await pool.query('SELECT 1 FROM owner_attachment_blobs LIMIT 1');
  const app = createApp({ pool });
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  app.listen(port, '0.0.0.0', () => {
    // Avoid logging secrets or database names.
    process.stdout.write('Rakan Balance private API listening on port ' + port + '\n');
  });
}
main().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
});
