import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.mjs';
import { hashPassword } from '../security.mjs';

test('login limiter persists across separate app instances and fails closed on storage errors', async () => {
  const validPassword = 'long test password for Rakan 2026';
  const passwordHash = await hashPassword(validPassword);
  const attempts = new Map();
  let denyDatabase = false;
  const sharedPool = {
    async execute(sql, params = []) {
      if (sql.includes('INSERT INTO owner_login_limits')) {
        if (denyDatabase) throw new Error('database unavailable');
        const key = params[0];
        attempts.set(key, (attempts.get(key) || 0) + 1);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) {
        if (denyDatabase) throw new Error('database unavailable');
        return [[{ attempts: attempts.get(params[0]), retry_seconds: 540 }], []];
      }
      if (sql.startsWith('DELETE FROM owner_login_limits')) {
        if (denyDatabase) throw new Error('database unavailable');
        attempts.delete(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: passwordHash }], []];
      throw new Error('Unexpected SQL: ' + sql);
    },
    async query() { return [[{ ok: 1 }], []]; },
  };
  const env = {
    APP_ORIGIN: 'http://127.0.0.1:3000',
    RAKAN_CSRF_SECRET: 'local-test-only-csrf-secret-more-than-32-characters',
  };
  const servers = await Promise.all([0, 1].map(() => new Promise(resolve => {
    const server = createApp({ pool: sharedPool, env }).listen(0, '127.0.0.1', () => resolve(server));
  })));
  async function login(server, password) {
    return fetch('http://127.0.0.1:' + server.address().port + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  }
  try {
    for (let index = 0; index < 8; index++) {
      const response = await login(servers[index % 2], 'wrong password');
      assert.equal(response.status, 401);
    }
    assert.equal(attempts.size, 1, 'the same network identity must share one database row');
    const digest = [...attempts.keys()][0];
    assert.match(digest, /^[a-f0-9]{64}$/);
    const blocked = await login(servers[1], validPassword);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '540');
    denyDatabase = true;
    const unavailable = await login(servers[0], validPassword);
    assert.equal(unavailable.status, 503);
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  }
});


test('Hostinger one-hop proxy trust keeps separate forwarded client addresses in separate limiter buckets', async () => {
  const passwordHash = await hashPassword('another strong owner password 2026');
  const attempts = new Map();
  const pool = {
    async execute(sql, params = []) {
      if (sql.includes('INSERT INTO owner_login_limits')) {
        attempts.set(params[0], (attempts.get(params[0]) || 0) + 1);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) {
        return [[{ attempts: attempts.get(params[0]) || 0, retry_seconds: 900 }], []];
      }
      if (sql.startsWith('DELETE FROM owner_login_limits')) {
        attempts.delete(params[0]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: passwordHash }], []];
      throw new Error('Unexpected SQL: ' + sql);
    },
    async query() { return [[{ ok: 1 }], []]; },
  };
  const env = {
    APP_ORIGIN: 'http://127.0.0.1:3000',
    RAKAN_CSRF_SECRET: 'proxy-test-only-csrf-secret-more-than-32-characters',
  };
  const app = createApp({ pool, env });
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function login(forwardedFor) {
    return fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: env.APP_ORIGIN,
        'Content-Type': 'application/json',
        'X-Forwarded-For': forwardedFor,
      },
      body: JSON.stringify({ password: 'wrong password' }),
    });
  }
  try {
    assert.equal((await login('203.0.113.10')).status, 401);
    assert.equal((await login('203.0.113.11')).status, 401);
    assert.equal(attempts.size, 2, 'different forwarded visitor IPs must not share one limiter bucket');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
