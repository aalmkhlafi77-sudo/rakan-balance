import { Router } from 'express';
import { createHmac } from 'node:crypto';
import {
  canonicalOrigin, secretDigest, newSecret, verifyPassword,
  safeDigestEqual, readSessionCookie,
} from './security.mjs';

const COOKIE_NAME = '__Host-rakan_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function createOwnerAuth(pool, env = process.env) {
  const appOrigin = canonicalOrigin(env.APP_ORIGIN);
  if (!env.RAKAN_CSRF_SECRET || env.RAKAN_CSRF_SECRET.length < 32) {
    throw new Error('RAKAN_CSRF_SECRET must be at least 32 characters');
  }
  const router = Router();
  const loginAttempts = new Map();
  const isSecure = appOrigin.startsWith('https:');

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
      ...(isSecure ? ['Secure'] : []),
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
    const now = Date.now();
    const address = req.ip || 'unknown';
    // Bounded process-local limiter for phase A; production should additionally
    // use Hostinger edge rate controls before public rollout.
    for (const [ip, info] of loginAttempts) {
      if (info.until <= now) loginAttempts.delete(ip);
    }
    const info = loginAttempts.get(address) || { count: 0, until: now + RATE_WINDOW_MS };
    if (info.count >= MAX_ATTEMPTS && info.until > now) {
      res.set('Retry-After', String(Math.ceil((info.until - now) / 1000)));
      return res.status(429).json({ error: 'too_many_attempts' });
    }
    info.count += 1;
    loginAttempts.set(address, info);
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
        [secretDigest(token), secretDigest(csrf), new Date(now + SESSION_MS)],
      );
      loginAttempts.delete(address);
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
