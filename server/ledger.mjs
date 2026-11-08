import { createHash } from 'node:crypto';
import { validateBackupFile } from './generated/owner-validator.mjs';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
function responseError(res, status, reason) {
  return res.status(status).json({ error: reason });
}
function jsonSize(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function registerOwnerLedgerRoutes(app, pool, auth) {
  // Every endpoint is protected by the same server-verified owner session.
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

  app.put('/api/owner/ledger', auth.requireOwner, auth.strictOrigin, auth.requireCsrf, async (req, res) => {
    const { expectedRevision, bundle } = req.body || {};
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !bundle || typeof bundle !== 'object' ||
        Array.isArray(bundle)) return responseError(res, 400, 'invalid_request');
    let raw;
    try {
      raw = Buffer.from(JSON.stringify(bundle), 'utf8');
    } catch {
      return responseError(res, 400, 'invalid_request');
    }
    if (raw.length > MAX_JSON_BYTES) return responseError(res, 413, 'ledger_payload_too_large');
    // Hash supplied by client is not a password. Full source-of-truth N0/N1/N2
    // validation is run on the server, not trusted to the caller.
    const check = await validateBackupFile(raw.toString('utf8'));
    if (!check.isValid) return responseError(res, 422, 'invalid_financial_ledger');
    // Prevent unsafe dynamic shape/prototype keys not covered by older backup spec.
    if (Object.keys(bundle).some((k) => !['manifest', 'data'].includes(k))) {
      return responseError(res, 422, 'unexpected_fields');
    }

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
      const checksum = createHash('sha256').update(raw).digest('hex');
      await connection.execute(
        'UPDATE owner_ledger_snapshot SET revision = ?, payload = ?, payload_sha256 = ? WHERE id = 1',
        [currentRevision + 1, raw, checksum],
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
