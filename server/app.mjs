import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnerAuth } from './auth.mjs';
import { registerOwnerLedgerRoutes } from './ledger.mjs';
import { registerPrivateAttachmentRoutes } from './attachments.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

export function createApp({ pool, env = process.env, staticRoot = dist }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const auth = createOwnerAuth(pool, env);
  app.use('/api/auth', express.json({ limit: '16kb', type: 'application/json' }), auth.router);
  registerOwnerLedgerRoutes(app, pool, auth);
  registerPrivateAttachmentRoutes(app, pool, auth);
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, databaseReady: true });
    } catch {
      res.status(503).json({ ok: false, databaseReady: false });
    }
  });
  // Guarded operational status. No browser visitor can access owner data.
  app.get('/api/owner/status', auth.requireOwner, (_req, res) => {
    res.json({ authenticated: true, storageReady: false });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  app.use(express.static(staticRoot, {
    index: false,
    setHeaders: (res, file) => {
      if (/\.html$|\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => {
    if (/\.[a-z0-9]+$/i.test(req.path)) return res.status(404).end();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(staticRoot, 'index.html'), (error) => {
      if (error && !res.headersSent) res.status(503).end();
    });
  });
  return app;
}
