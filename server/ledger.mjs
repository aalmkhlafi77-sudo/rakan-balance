import { createHash } from 'node:crypto';
import express from 'express';
import { validateBackupFile } from './generated/owner-validator.mjs';
import { preparePrivateAttachmentState, syncPrivateAttachmentRows } from './attachments.mjs';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
function responseError(res, status, reason) {
  return res.status(status).json({ error: reason });
}

export function registerOwnerLedgerRoutes(app, pool, auth) {
  app.get('/api/owner/ledger', auth.requireOwner, async (_req, res) => {
    try {
      const [rows] = await pool.execute(
        'SELECT revision, payload, payload_sha256 FROM owner_ledger_snapshot WHERE id = 1 LIMIT 1',
      );
      if (rows.length !== 1) return responseError(res, 503, 'ledger_not_initialized');
      const row = rows[0];
      const revision = Number(row.revision);
      if (!Number.isSafeInteger(revision)) return responseError(res, 503, 'revision_limit_exceeded');
      if (row.payload === null) return res.json({ revision, bundle: null });
      const raw = Buffer.isBuffer(row.payload) ? row.payload : Buffer.from(row.payload);
      if (raw.length > MAX_JSON_BYTES) return responseError(res, 503, 'invalid_stored_payload');
      const digest = createHash('sha256').update(raw).digest('hex');
      if (digest !== row.payload_sha256) return responseError(res, 503, 'ledger_checksum_mismatch');
      return res.json({ revision, bundle: JSON.parse(raw.toString('utf8')) });
    } catch {
      return responseError(res, 503, 'service_unavailable');
    }
  });

  app.put('/api/owner/ledger', auth.requireOwner, auth.strictOrigin,
    express.json({ limit: '18mb', type: 'application/json' }), auth.requireCsrf, async (req, res) => {
    const { expectedRevision, bundle } = req.body || {};
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !bundle ||
        typeof bundle !== 'object' || Array.isArray(bundle)) {
      return responseError(res, 400, 'invalid_request');
    }
    let incomingRaw;
    try {
      incomingRaw = Buffer.from(JSON.stringify(bundle), 'utf8');
    } catch {
      return responseError(res, 400, 'invalid_request');
    }
    if (incomingRaw.length > MAX_JSON_BYTES) return responseError(res, 413, 'ledger_payload_too_large');

    const savedSettings = bundle.data?.settings;
    if (savedSettings && typeof savedSettings === 'object' &&
        ['pinCodeHash', 'pinSalt', 'isLocked', 'password', 'passwordHash', 'csrfToken'].some(
          field => Object.prototype.hasOwnProperty.call(savedSettings, field))) {
      return responseError(res, 422, 'sensitive_settings_not_allowed');
    }

    const check = await validateBackupFile(incomingRaw.toString('utf8'));
    if (!check.isValid) return responseError(res, 422, 'invalid_financial_ledger');
    if (Object.keys(bundle).some(k => !['manifest', 'data'].includes(k))) {
      return responseError(res, 422, 'unexpected_fields');
    }

    let prepared;
    let storedBundle;
    let storedRaw;
    try {
      ({ prepared, storedBundle } = preparePrivateAttachmentState(bundle));
      storedRaw = Buffer.from(JSON.stringify(storedBundle), 'utf8');
    } catch {
      return responseError(res, 422, 'invalid_private_attachment');
    }
    if (storedRaw.length > MAX_JSON_BYTES) return responseError(res, 413, 'ledger_payload_too_large');

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT revision FROM owner_ledger_snapshot WHERE id = 1 FOR UPDATE',
      );
      if (rows.length !== 1) {
        await connection.rollback();
        return responseError(res, 503, 'ledger_not_initialized');
      }
      const currentRevision = Number(rows[0].revision);
      if (!Number.isSafeInteger(currentRevision)) {
        await connection.rollback();
        return responseError(res, 503, 'revision_limit_exceeded');
      }
      if (currentRevision !== expectedRevision) {
        await connection.rollback();
        return res.status(409).json({ error: 'revision_conflict', currentRevision });
      }
      if (currentRevision >= Number.MAX_SAFE_INTEGER) {
        await connection.rollback();
        return responseError(res, 409, 'revision_limit_exceeded');
      }

      // Blob inserts/deletes and ledger metadata become visible together.
      await syncPrivateAttachmentRows(connection, prepared);
      const checksum = createHash('sha256').update(storedRaw).digest('hex');
      await connection.execute(
        'UPDATE owner_ledger_snapshot SET revision = ?, payload = ?, payload_sha256 = ? WHERE id = 1',
        [currentRevision + 1, storedRaw, checksum],
      );
      await connection.commit();
      return res.json({ ok: true, revision: currentRevision + 1 });
    } catch {
      if (connection) {
        try { await connection.rollback(); } catch { /* preserve request failure */ }
      }
      return responseError(res, 503, 'service_unavailable');
    } finally {
      connection?.release();
    }
  });
}
