import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function ensureStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 128) {
    throw new Error('Owner password must have between 14 and 128 characters.');
  }
}

export async function hashPassword(password) {
  ensureStrongPassword(password);
  const salt = randomBytes(24).toString('hex');
  const derived = await scrypt(password, Buffer.from(salt, 'hex'), 64, PARAMS);
  return 'scrypt$32768$8$1$' + salt + '$' + derived.toString('hex');
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '32768' ||
      parts[2] !== '8' || parts[3] !== '1' || !/^[a-f0-9]{48}$/i.test(parts[4]) ||
      !/^[a-f0-9]{128}$/i.test(parts[5])) return false;
  const actual = await scrypt(password, Buffer.from(parts[4], 'hex'), 64, PARAMS);
  const expected = Buffer.from(parts[5], 'hex');
  return timingSafeEqual(actual, expected);
}

export function newSecret() {
  return randomBytes(32).toString('hex');
}
export function secretDigest(secret) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
export function safeDigestEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export function readSessionCookie(header) {
  if (typeof header !== 'string') return null;
  const pairs = header.split(';');
  const found = pairs.find((pair) => pair.trim().startsWith('__Host-rakan_session='));
  const value = found?.trim().slice('__Host-rakan_session='.length);
  return value && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}
export function canonicalOrigin(origin) {
  if (!origin || typeof origin !== 'string') throw new Error('APP_ORIGIN is required');
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('APP_ORIGIN must be an origin, without paths or credentials');
  }
  if (url.protocol !== 'https:' && !(url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    throw new Error('APP_ORIGIN must use HTTPS');
  }
  return url.origin;
}
