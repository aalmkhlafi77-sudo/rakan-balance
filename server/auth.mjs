import { Router } from 'express';
import { createHmac } from 'node:crypto';
import {
  canonicalOrigin, secretDigest, newSecret, verifyPassword,
  safeDigestEqual, readSessionCookie,
} from './security.mjs';

const COOKIE_NAME = '__Host-rakan_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function createOwnerAuth(pool, env = process.env) {
  const appOrigin = canonicalOrigin(env.APP_ORIGIN);
  if (!env.RAKAN_CSRF_SECRET || env.RAKAN_CSRF_SECRET.length < 32) {
    throw new Error('RAKAN_CSRF_SECRET must be at least 32 characters');
  }
  const router = Router();
  // Login limits are atomic and persisted in the dedicated MySQL database.
  // __Host- cookies must always carry Secure, including local development.

  // Never accept cross-site state-changing requests; no CORS is enabled.
  function strictOrigin(req, res, next) {
    if (req.get('origin') !== appOrigin || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    next();
  }

  function csrfForToken(token) {
    return createHmac('sha256', env.RAKAN_CSRF_SECRET).update(token, 'utf8').digest('hex');
  }
  function sendCookie(res, value, expire = false) {
    const parts = [
      COOKIE_NAME + '=' + (expire ? '' : value),
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Secure',
      ...(expire ? ['Max-Age=0'] : ['Max-Age=' + Math.floor(SESSION_MS / 1000)]),
    ];
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  async function readSession(req) {
    const token = readSessionCookie(req.get('cookie'));
    if (!token) return null;
    const [rows] = await pool.execute(
      'SELECT token_hash, csrf_hash FROM owner_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1',
      [secretDigest(token)],
    );
    return rows.length ? { token, row: rows[0] } : null;
  }

  async function requireOwner(req, res, next) {
    try {
      const session = await readSession(req);
      if (!session) return res.status(401).json({ error: 'not_authenticated' });
      req.ownerSession = session;
      next();
    } catch {
      res.status(503).json({ error: 'service_unavailable' });
    }
  }
  function requireCsrf(req, res, next) {
    const token = req.ownerSession?.token;
    const header = req.get('x-csrf-token');
    if (!token || !header || !safeDigestEqual(secretDigest(header), req.ownerSession.row.csrf_hash) ||
        !safeDigestEqual(secretDigest(header), secretDigest(csrfForToken(token)))) {
      return res.status(403).json({ error: 'invalid_csrf_token' });
    }
    next();
  }

  router.get('/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const session = await readSession(req);
      res.status(200).json(session
        ? { authenticated: true, csrfToken: csrfForToken(session.token) }
        : { authenticated: false });
    } catch {
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  router.post('/login', strictOrigin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Hash the network identifier; never persist raw client IP addresses.
    // A failed database query fails closed rather than disabling the limiter.
    const address = req.ip || 'unknown';
    const addressHash = createHmac('sha256', env.RAKAN_CSRF_SECRET)
      .update('owner-login-ip:' + address, 'utf8').digest('hex');
    try {
      // The unique primary key serializes increments across server processes.
      await pool.execute(
        `INSERT INTO owner_login_limits (address_hash, attempts, window_ends_at)
         VALUES (?, 1, UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE)
         ON DUPLICATE KEY UPDATE
           attempts = IF(window_ends_at <= UTC_TIMESTAMP(3), 1, attempts + 1),
           window_ends_at = IF(window_ends_at <= UTC_TIMESTAMP(3),
                              UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE, window_ends_at)`,
        [addressHash],
      );
      const [limits] = await pool.execute(
        `SELECT attempts,
                GREATEST(1, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), window_ends_at)) AS retry_seconds
         FROM owner_login_limits WHERE address_hash = ? LIMIT 1`,
        [addressHash],
      );
      if (limits.length !== 1) throw new Error('Missing rate-limit row');
      if (Number(limits[0].attempts) > MAX_ATTEMPTS) {
        res.set('Retry-After', String(Math.max(1, Number(limits[0].retry_seconds) || 1)));
        return res.status(429).json({ error: 'too_many_attempts' });
      }
    } catch {
      return res.status(503).json({ error: 'service_unavailable' });
    }
    if (typeof req.body?.password !== 'string' || req.body.password.length > 128 ||
        req.body.password.length === 0) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    try {
      const [owners] = await pool.execute('SELECT password_hash FROM owner_credentials WHERE id = 1 LIMIT 1');
      const valid = owners.length === 1 && await verifyPassword(req.body.password, owners[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials' });
      const token = newSecret();
      const csrf = csrfForToken(token);
      await pool.execute(
        'INSERT INTO owner_sessions (token_hash, csrf_hash, expires_at) VALUES (?, ?, ?)',
        [secretDigest(token), secretDigest(csrf), new Date(Date.now() + SESSION_MS)],
      );
      await pool.execute('DELETE FROM owner_login_limits WHERE address_hash = ?', [addressHash]);
      sendCookie(res, token);
      return res.json({ authenticated: true, csrfToken: csrf });
    } catch {
      return res.status(503).json({ error: 'service_unavailable' });
    }
  });

  router.post('/logout', strictOrigin, requireOwner, requireCsrf, async (req, res) => {
    try {
      await pool.execute('DELETE FROM owner_sessions WHERE token_hash = ?', [secretDigest(req.ownerSession.token)]);
      sendCookie(res, '', true);
      return res.status(204).end();
    } catch {
      return res.status(503).json({ error: 'service_unavailable' });
    }
  });

  return { router, requireOwner, strictOrigin, requireCsrf };
}
