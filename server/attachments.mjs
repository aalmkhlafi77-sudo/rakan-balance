import { createHash } from 'node:crypto';
import express from 'express';

const MAX_BYTES = 5 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
function validMime(buf) {
  if (buf.length >= 5 && buf.subarray(0,5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return 'image/jpeg';
  if (buf.length >= 6 && ['GIF87a','GIF89a'].includes(buf.subarray(0,6).toString('ascii'))) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0,4).toString('ascii') === 'RIFF' &&
      buf.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
function refuse(res, status, error) { return res.status(status).json({ error }); }
async function ledgerHasLink(pool, attachmentId, transactionId) {
  const [rows] = await pool.execute('SELECT payload, payload_sha256 FROM owner_ledger_snapshot WHERE id = 1 LIMIT 1');
  if (rows.length !== 1 || !rows[0].payload) return false;
  const payload = Buffer.isBuffer(rows[0].payload) ? rows[0].payload : Buffer.from(rows[0].payload);
  if (createHash('sha256').update(payload).digest('hex') !== rows[0].payload_sha256) {
    throw new Error('Ledger integrity failure');
  }
  const bundle = JSON.parse(payload.toString('utf8'));
  return bundle.data?.transactions?.some(x => x.id === transactionId &&
    x.attachmentIds?.includes(attachmentId)) &&
    bundle.data?.attachments?.some(x => x.id === attachmentId && x.transactionId === transactionId);
}

export function registerPrivateAttachmentRoutes(app, pool, auth) {
  app.put('/api/owner/attachment-blobs/:id',
    auth.requireOwner, auth.strictOrigin,
    express.raw({type:'application/octet-stream', limit: MAX_BYTES}),
    auth.requireCsrf, async (req, res) => {
      const id = req.params.id;
      const transactionId = req.get('x-transaction-id');
      const bytes = req.body;
      if (!ID.test(id) || !transactionId || !ID.test(transactionId)) return refuse(res, 400, 'invalid_attachment_reference');
      if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES) return refuse(res, 413, 'attachment_size_invalid');
      const mime = validMime(bytes);
      if (!mime || req.get('content-type') !== 'application/octet-stream') return refuse(res, 415, 'unsupported_attachment');
      try {
        if (!await ledgerHasLink(pool, id, transactionId)) return refuse(res, 409, 'ledger_attachment_not_committed');
        const sha = createHash('sha256').update(bytes).digest('hex');
        // Identifiers are immutable: a second upload cannot overwrite an earlier document.
        await pool.execute(
          'INSERT INTO owner_attachment_blobs (attachment_id, transaction_id, mime_type, byte_length, sha256, content) VALUES (?, ?, ?, ?, ?, ?)',
          [id, transactionId, mime, bytes.length, sha, bytes],
        );
        return res.status(201).json({ attachmentId:id, transactionId, bytes:bytes.length, sha256:sha });
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') return refuse(res, 409, 'attachment_already_exists');
        return refuse(res, 503, 'service_unavailable');
      }
    });
  app.get('/api/owner/attachment-blobs/:id', auth.requireOwner, async (req, res) => {
    if (!ID.test(req.params.id)) return refuse(res, 400, 'invalid_attachment_reference');
    try {
      const [rows] = await pool.execute(
        'SELECT transaction_id, mime_type, byte_length, sha256, content FROM owner_attachment_blobs WHERE attachment_id = ? LIMIT 1',
        [req.params.id],
      );
      if (rows.length !== 1) return refuse(res, 404, 'attachment_not_found');
      const row = rows[0];
      if (!await ledgerHasLink(pool, req.params.id, row.transaction_id)) return refuse(res, 404, 'attachment_not_found');
      const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
      if (buf.length !== Number(row.byte_length) ||
          createHash('sha256').update(buf).digest('hex') !== row.sha256 || validMime(buf) !== row.mime_type) {
        return refuse(res, 503, 'attachment_integrity_failure');
      }
      res.set({
        'Content-Type': row.mime_type,
        'Content-Disposition': 'attachment',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options':'nosniff',
      });
      return res.status(200).send(buf);
    } catch {
      return refuse(res, 503, 'service_unavailable');
    }
  });
}
