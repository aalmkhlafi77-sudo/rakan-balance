import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnerAuth } from './auth.mjs';
import { createOwnerLedgerStore, RevisionConflict } from './owner-ledger-store.mjs';
import { InvalidLedger } from './ledger-validation.mjs';

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
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, databaseReady: true });
    } catch {
      res.status(503).json({ ok: false, databaseReady: false });
    }
  });
  const ownerStore = createOwnerLedgerStore(pool);
  app.use('/api/owner', auth.requireOwner);
  app.get('/api/owner/status', (_req, res) => {
    res.json({ authenticated: true, storageReady: true });
  });
  app.get('/api/owner/ledger', async (_req, res) => {
    try { return res.json(await ownerStore.read()); }
    catch { return res.status(503).json({ error: 'storage_unavailable' }); }
  });
  app.put('/api/owner/ledger', auth.strictOrigin, auth.requireCsrf,
    express.json({ limit: '24mb', type: 'application/json' }), async (req, res) => {
      try {
        const revision = await ownerStore.write(req.body?.expectedRevision, req.body?.data);
        return res.status(200).json(revision);
      } catch (error) {
        if (error instanceof RevisionConflict) {
          return res.status(409).json({ error: 'revision_conflict', currentRevision: error.revision });
        }
        if (error instanceof InvalidLedger || error.message === 'Invalid expected revision' ||
            error.message.includes('exceeds configured')) {
          return res.status(400).json({ error: 'invalid_ledger', reason: error.message });
        }
        return res.status(503).json({ error: 'storage_unavailable' });
      }
    });
  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'invalid_json' });
    next(err);
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
