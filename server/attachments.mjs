import { createHash } from 'node:crypto';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const PRIVATE_PREFIX = 'rakan-private://attachment/';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function normalizeMime(value) {
  return value === 'image/jpg' ? 'image/jpeg' : value;
}
function sniffMime(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return 'image/jpeg';
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}
function decodeBase64Exact(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('invalid_attachment_base64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('invalid_attachment_base64');
  return bytes;
}
function decodeDataUrl(dataUrl, claimedMime) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('invalid_attachment_data_url');
  const bytes = decodeBase64Exact(match[2]);
  if (bytes.length < 1 || bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('attachment_size_invalid');
  const actualMime = sniffMime(bytes);
  const declared = normalizeMime(match[1].toLowerCase());
  const claimed = normalizeMime(String(claimedMime || '').toLowerCase());
  if (!actualMime || actualMime !== declared || actualMime !== claimed) {
    throw new Error('attachment_mime_mismatch');
  }
  return { bytes, mimeType: actualMime, sha256: digest(bytes) };
}
export function privateAttachmentUrl(id) {
  return PRIVATE_PREFIX + id;
}
export function isPrivateAttachmentUrl(value, id) {
  return typeof value === 'string' && value === privateAttachmentUrl(id);
}
function canonicalPayload(data) {
  const payload = {
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.transactions,
    attachments: data.attachments,
    notes: data.notes,
  };
  if (data.dues !== undefined) payload.dues = data.dues;
  if (data.allocations !== undefined) payload.allocations = data.allocations;
  if (data.reminders !== undefined) payload.reminders = data.reminders;
  if (data.settings !== undefined) payload.settings = data.settings;
  return payload;
}

export function preparePrivateAttachmentState(bundle) {
  if (!bundle?.data || !Array.isArray(bundle.data.attachments) || !Array.isArray(bundle.data.transactions)) {
    throw new Error('invalid_attachment_bundle');
  }
  const transactionIds = new Set(bundle.data.transactions.map(x => x?.id));
  const seen = new Set();
  const prepared = [];
  const storedBundle = structuredClone(bundle);
  for (let index = 0; index < bundle.data.attachments.length; index++) {
    const attachment = bundle.data.attachments[index];
    if (!attachment || !ID.test(attachment.id) || !ID.test(attachment.transactionId) ||
        seen.has(attachment.id) || !transactionIds.has(attachment.transactionId) ||
        !Number.isSafeInteger(attachment.size) || attachment.size < 1 ||
        attachment.size > MAX_ATTACHMENT_BYTES) {
      throw new Error('invalid_attachment_metadata');
    }
    seen.add(attachment.id);
    const linked = bundle.data.transactions.some(tx =>
      tx.id === attachment.transactionId && Array.isArray(tx.attachmentIds) &&
      tx.attachmentIds.includes(attachment.id));
    if (!linked) throw new Error('attachment_not_linked');
    if (isPrivateAttachmentUrl(attachment.dataUrl, attachment.id)) {
      prepared.push({
        id: attachment.id, transactionId: attachment.transactionId,
        mimeType: normalizeMime(attachment.mimeType), size: attachment.size,
        sha256: null, bytes: null,
      });
    } else {
      const decoded = decodeDataUrl(attachment.dataUrl, attachment.mimeType);
      if (decoded.bytes.length !== attachment.size) throw new Error('attachment_size_mismatch');
      prepared.push({
        id: attachment.id, transactionId: attachment.transactionId,
        mimeType: decoded.mimeType, size: decoded.bytes.length,
        sha256: decoded.sha256, bytes: decoded.bytes,
      });
    }
    storedBundle.data.attachments[index].dataUrl = privateAttachmentUrl(attachment.id);
    storedBundle.data.attachments[index].mimeType = normalizeMime(attachment.mimeType);
  }
  storedBundle.manifest.checksum = digest(Buffer.from(JSON.stringify(canonicalPayload(storedBundle.data)), 'utf8'));
  return { prepared, storedBundle };
}

export async function syncPrivateAttachmentRows(connection, prepared) {
  const [existingRows] = await connection.execute(
    'SELECT attachment_id, transaction_id, mime_type, byte_length, sha256 FROM owner_attachment_blobs FOR UPDATE',
  );
  const existing = new Map(existingRows.map(row => [row.attachment_id, row]));
  const retained = new Set();
  for (const item of prepared) {
    retained.add(item.id);
    const current = existing.get(item.id);
    if (!item.bytes) {
      if (!current || current.transaction_id !== item.transactionId ||
          normalizeMime(current.mime_type) !== item.mimeType ||
          Number(current.byte_length) !== item.size) {
        throw new Error('private_attachment_missing');
      }
      continue;
    }
    if (current) {
      if (current.transaction_id !== item.transactionId ||
          normalizeMime(current.mime_type) !== item.mimeType ||
          Number(current.byte_length) !== item.size ||
          current.sha256 !== item.sha256) {
        throw new Error('private_attachment_conflict');
      }
      continue;
    }
    await connection.execute(
      'INSERT INTO owner_attachment_blobs (attachment_id, transaction_id, mime_type, byte_length, sha256, content) VALUES (?, ?, ?, ?, ?, ?)',
      [item.id, item.transactionId, item.mimeType, item.size, item.sha256, item.bytes],
    );
  }
  for (const row of existingRows) {
    if (!retained.has(row.attachment_id)) {
      await connection.execute('DELETE FROM owner_attachment_blobs WHERE attachment_id = ?', [row.attachment_id]);
    }
  }
}

async function ledgerHasLink(pool, attachmentId, transactionId) {
  const [rows] = await pool.execute(
    'SELECT payload, payload_sha256 FROM owner_ledger_snapshot WHERE id = 1 LIMIT 1',
  );
  if (rows.length !== 1 || !rows[0].payload) return false;
  const payload = Buffer.isBuffer(rows[0].payload) ? rows[0].payload : Buffer.from(rows[0].payload);
  if (digest(payload) !== rows[0].payload_sha256) throw new Error('ledger_integrity_failure');
  const bundle = JSON.parse(payload.toString('utf8'));
  return bundle.data?.transactions?.some(x => x.id === transactionId &&
    x.attachmentIds?.includes(attachmentId)) &&
    bundle.data?.attachments?.some(x => x.id === attachmentId &&
      x.transactionId === transactionId && isPrivateAttachmentUrl(x.dataUrl, attachmentId));
}

function refuse(res, status, error) {
  return res.status(status).json({ error });
}

export function registerPrivateAttachmentRoutes(app, pool, auth) {
  // Binary writes are deliberately NOT exposed separately. They are performed
  // atomically by PUT /api/owner/ledger in the same InnoDB transaction.
  app.get('/api/owner/attachment-blobs/:id', auth.requireOwner, async (req, res) => {
    if (!ID.test(req.params.id)) return refuse(res, 400, 'invalid_attachment_reference');
    try {
      const [rows] = await pool.execute(
        'SELECT transaction_id, mime_type, byte_length, sha256, content FROM owner_attachment_blobs WHERE attachment_id = ? LIMIT 1',
        [req.params.id],
      );
      if (rows.length !== 1) return refuse(res, 404, 'attachment_not_found');
      const row = rows[0];
      if (!await ledgerHasLink(pool, req.params.id, row.transaction_id)) {
        return refuse(res, 404, 'attachment_not_found');
      }
      const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
      if (buf.length !== Number(row.byte_length) || digest(buf) !== row.sha256 ||
          sniffMime(buf) !== normalizeMime(row.mime_type)) {
        return refuse(res, 503, 'attachment_integrity_failure');
      }
      res.set({
        'Content-Type': normalizeMime(row.mime_type),
        'Content-Disposition': 'attachment',
        'Content-Length': String(buf.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.status(200).send(buf);
    } catch {
      return refuse(res, 503, 'service_unavailable');
    }
  });
}
