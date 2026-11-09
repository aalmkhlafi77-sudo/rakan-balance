import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../app.mjs';
import { hashPassword } from '../security.mjs';

function emptyBundle() {
  const data = {
    accounts: [], categories: [], transactions: [], attachments: [], notes: [],
    dues: [], allocations: [], reminders: [],
  };
  const checksum = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return {
    manifest: {
      formatName: 'RAKAN_BALANCE_BACKUP', schemaVersion: 2, backupFormatVersion: 2,
      exportedAt: new Date().toISOString(), appName: 'RAKAN BALANCE',
      checksum,
      recordCounts: { accounts: 0, categories: 0, transactions: 0, attachments: 0, notes: 0, dues: 0, allocations: 0, reminders: 0 },
    },
    data,
  };
}
test('owner ledger is private, validates data, rejects stale revisions atomically and never writes on CSRF failure', async () => {
  const password = 'long secure password for testing 2026';
  const pwHash = await hashPassword(password);
  const sessions = new Map();
  const limits = new Map();
  const ledger = { revision: 0, payload: null, payload_sha256: null };
  const db = {
    async execute(sql, vals = []) {
      if (sql.includes('INSERT INTO owner_login_limits')) {
        const prev = limits.get(vals[0]) || 0;
        limits.set(vals[0], prev + 1);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) {
        return [[{ attempts: limits.get(vals[0]) || 0, retry_seconds: 900 }], []];
      }
      if (sql.startsWith('DELETE FROM owner_login_limits')) {
        limits.delete(vals[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: pwHash }], []];
      if (sql.startsWith('SELECT token_hash')) return [sessions.has(vals[0]) ? [sessions.get(vals[0])] : [], []];
      if (sql.startsWith('INSERT INTO owner_sessions')) {
        sessions.set(vals[0], { token_hash: vals[0], csrf_hash: vals[1] });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('DELETE FROM owner_sessions')) { sessions.delete(vals[0]); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith('SELECT revision, payload, payload_sha256')) return [[{ ...ledger }], []];
      if (sql.startsWith('SELECT revision FROM owner_ledger_snapshot')) return [[{ revision: ledger.revision }], []];
      if (sql.startsWith('SELECT attachment_id, transaction_id, mime_type, byte_length, sha256 FROM owner_attachment_blobs')) return [[], []];
      if (sql.startsWith('UPDATE owner_ledger_snapshot')) {
        ledger.revision = vals[0]; ledger.payload = vals[1]; ledger.payload_sha256 = vals[2];
        return [{ affectedRows: 1 }, []];
      }
      throw new Error('Unexpected query ' + sql);
    },
    async query() { return [[{}], []]; },
    async getConnection() {
      return {
        execute: (sql, vals) => db.execute(sql, vals),
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
  };
  const app = createApp({ pool: db, env: {
    APP_ORIGIN: 'http://127.0.0.1:3000',
    RAKAN_CSRF_SECRET: 'test-csrf-secret-this-is-over-thirty-two-characters',
  }});
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (url, opts = {}) => fetch(base + url, opts);
  try {
    const forbidden = await send('/api/owner/ledger');
    assert.equal(forbidden.status, 401);
    const unauthenticatedPut = await send('/api/owner/ledger', {
      method: 'PUT', headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, bundle: emptyBundle() }),
    });
    assert.equal(unauthenticatedPut.status, 401);
    const login = await send('/api/auth/login', {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    const csrf = (await login.json()).csrfToken;
    assert.ok(cookie && csrf);

    const getBefore = await send('/api/owner/ledger', { headers: { Cookie: cookie } });
    assert.deepEqual(await getBefore.json(), { revision: 0, bundle: null });

    const noCsrf = await send('/api/owner/ledger', {
      method: 'PUT', headers: { Origin: 'http://127.0.0.1:3000', Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, bundle: emptyBundle() }),
    });
    assert.equal(noCsrf.status, 403);
    assert.equal(ledger.revision, 0);

    const headers = { Origin: 'http://127.0.0.1:3000', Cookie: cookie,
      'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const saved = await send('/api/owner/ledger', { method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 0, bundle: emptyBundle() }) });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).revision, 1);
    const got = await send('/api/owner/ledger', { headers: { Cookie: cookie } });
    assert.equal((await got.json()).revision, 1);

    const conflict = await send('/api/owner/ledger', { method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 0, bundle: emptyBundle() }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).currentRevision, 1);
    assert.equal(ledger.revision, 1);

    const malformed = emptyBundle();
    malformed.data.transactions.push({ id: 'bad', accountId: 'unknown', amountMinor: -9 });
    const rejected = await send('/api/owner/ledger', { method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 1, bundle: malformed }) });
    assert.equal(rejected.status, 422);
    assert.equal(ledger.revision, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
