import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const MAX_BACKUP_BYTES = 24 * 1024 * 1024;
const KDF = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function passphraseRequired(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 20) {
    throw new Error('RAKAN_BACKUP_PASSPHRASE must contain at least 20 characters');
  }
}
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateAttachmentRecords(records, payload) {
  if (!Array.isArray(records) || records.length > 1000) throw new Error('Invalid encrypted attachments');
  const ledger = payload === null ? null : JSON.parse(payload);
  const links = ledger?.data;
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' ||
        Object.keys(record).sort().join(',') !== ['attachmentId','base64','mimeType','sha256','transactionId'].sort().join(',') ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(record.attachmentId) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(record.transactionId) ||
        seen.has(record.attachmentId)) throw new Error('Invalid encrypted attachment metadata');
    seen.add(record.attachmentId);
    if (!['image/png','image/jpeg','image/webp','image/gif','application/pdf'].includes(record.mimeType)) {
      throw new Error('Invalid encrypted attachment MIME');
    }
    const bytes = exactBase64(record.base64, null);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || digest(bytes) !== record.sha256) {
      throw new Error('Encrypted attachment checksum mismatch');
    }
    if (!links?.transactions?.some(x=>x.id === record.transactionId && x.attachmentIds?.includes(record.attachmentId)) ||
        !links?.attachments?.some(x=>x.id === record.attachmentId && x.transactionId === record.transactionId)) {
      throw new Error('Encrypted attachment is not linked to a committed ledger record');
    }
  }
}

export async function encryptOwnerBackup(snapshot, passphrase) {
  passphraseRequired(passphrase);
  if (!snapshot || typeof snapshot !== 'object' ||
      !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      (snapshot.payload !== null && typeof snapshot.payload !== 'string')) {
    throw new Error('Invalid owner backup snapshot');
  }
  if (snapshot.attachments !== undefined) validateAttachmentRecords(snapshot.attachments, snapshot.payload);
  const plaintext = Buffer.from(JSON.stringify({
    revision: snapshot.revision, payload: snapshot.payload,
    payload_sha256: snapshot.payload === null ? null : digest(Buffer.from(snapshot.payload, 'utf8')),
    ...(snapshot.attachments === undefined ? {} : { attachments: snapshot.attachments }),
  }), 'utf8');
  if (plaintext.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds size limit');
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32, KDF);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    format: 'RAKAN_OWNER_ENCRYPTED_BACKUP',
    version: 1,
    algorithm: 'aes-256-gcm',
    kdf: 'scrypt-32768-8-1',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function exactBase64(value, count) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid encrypted backup encoding');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || (count !== null && decoded.length !== count)) {
    throw new Error('Invalid encrypted backup length');
  }
  return decoded;
}

export async function decryptOwnerBackup(serialized, passphrase) {
  passphraseRequired(passphrase);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > MAX_BACKUP_BYTES * 2) {
    throw new Error('Invalid encrypted backup size');
  }
  const envelope = JSON.parse(serialized);
  if (!envelope || envelope.format !== 'RAKAN_OWNER_ENCRYPTED_BACKUP' ||
      envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' ||
      envelope.kdf !== 'scrypt-32768-8-1' ||
      Object.keys(envelope).sort().join(',') !==
      ['algorithm', 'ciphertext', 'format', 'iv', 'kdf', 'salt', 'tag', 'version'].sort().join(',')) {
    throw new Error('Unsupported encrypted owner backup');
  }
  const salt = exactBase64(envelope.salt, 32);
  const iv = exactBase64(envelope.iv, 12);
  const tag = exactBase64(envelope.tag, 16);
  const ciphertext = exactBase64(envelope.ciphertext, null);
  if (ciphertext.length > MAX_BACKUP_BYTES) throw new Error('Backup exceeds size limit');
  const key = await scrypt(passphrase, salt, 32, KDF);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const snapshot = JSON.parse(raw.toString('utf8'));
  if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      (snapshot.payload !== null && typeof snapshot.payload !== 'string') ||
      Object.keys(snapshot).sort().join(',') !==
        (snapshot.attachments === undefined
          ? ['payload', 'payload_sha256', 'revision']
          : ['attachments', 'payload', 'payload_sha256', 'revision']).sort().join(',')) {
    throw new Error('Invalid decrypted owner snapshot');
  }
  const actual = snapshot.payload === null ? null : digest(Buffer.from(snapshot.payload, 'utf8'));
  if (actual !== snapshot.payload_sha256) throw new Error('Owner backup checksum mismatch');
  if (snapshot.attachments !== undefined) validateAttachmentRecords(snapshot.attachments, snapshot.payload);
  return snapshot;
}
