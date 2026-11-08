import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';
import { hashPassword, secretDigest } from '../security.mjs';

test('server refuses unauthenticated owner data, checks origin and CSRF, revokes logout', async () => {
  const password = 'strong owner password 2026 test';
  const hash = await hashPassword(password);
  const sessionByDigest = new Map();
  const limits = new Map();
  const pool = {
    async execute(sql, params = []) {
      if (sql.includes('INSERT INTO owner_login_limits')) {
        const prev = limits.get(params[0]) || 0;
        limits.set(params[0], prev + 1);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) {
        return [[{ attempts: limits.get(params[0]) || 0, retry_seconds: 900 }], []];
      }
      if (sql.startsWith('DELETE FROM owner_login_limits')) {
        limits.delete(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: hash }], []];
      if (sql.startsWith('SELECT token_hash')) {
        const row = sessionByDigest.get(params[0]);
        return [row && row.expires > Date.now() ? [row] : [], []];
      }
      if (sql.startsWith('INSERT INTO owner_sessions')) {
        sessionByDigest.set(params[0], { token_hash: params[0], csrf_hash: params[1], expires: params[2].getTime() });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('DELETE FROM owner_sessions')) {
        sessionByDigest.delete(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      throw new Error('Unexpected SQL: ' + sql);
    },
    async query() { return [[{ ok: 1 }], []]; },
  };
  const app = createApp({
    pool,
    env: { APP_ORIGIN: 'http://127.0.0.1:3000', RAKAN_CSRF_SECRET: 'test-only-csrf-secret-for-local-integration-tests' },
  });
  const listener = await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  const base = 'http://127.0.0.1:' + listener.address().port;
  async function request(url, opts = {}) {
    return fetch(base + url, opts);
  }
  try {
    let response = await request('/api/owner/status');
    assert.equal(response.status, 401);
    response = await request('/api/auth/status');
    assert.deepEqual(await response.json(), { authenticated: false });

    response = await request('/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 403);

    const headers = { Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' };
    response = await request('/api/auth/login', {
      method: 'POST', headers, body: JSON.stringify({ password: 'not-the-password' }),
    });
    assert.equal(response.status, 401);

    response = await request('/api/auth/login', {
      method: 'POST', headers, body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('__Host-rakan_session='));
    const login = await response.json();
    assert.equal(login.authenticated, true);
    assert.match(login.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal(sessionByDigest.size, 1);

    response = await request('/api/owner/status', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: true, storageReady: false });
    response = await request('/api/auth/status', { headers: { Cookie: cookie } });
    assert.equal((await response.json()).authenticated, true);

    response = await request('/api/auth/logout', {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', Cookie: cookie },
    });
    assert.equal(response.status, 403);
    response = await request('/api/auth/logout', {
      method: 'POST', headers: { Origin: 'http://127.0.0.1:3000', Cookie: cookie, 'x-csrf-token': login.csrfToken },
    });
    assert.equal(response.status, 204);
    assert.equal(sessionByDigest.size, 0);
    response = await request('/api/owner/status', { headers: { Cookie: cookie } });
    assert.equal(response.status, 401);
    assert.equal(secretDigest(cookie), secretDigest(cookie));
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
});
