import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalOrigin, ensureStrongPassword, hashPassword, verifyPassword, newSecret, secretDigest, safeDigestEqual, readSessionCookie } from '../security.mjs';

test('strong owner password uses salted slow hash; wrong password is rejected', async () => {
  const encoded = await hashPassword('correct horse battery staple 2026');
  const encodedAgain = await hashPassword('correct horse battery staple 2026');
  assert.notEqual(encoded, encodedAgain);
  assert.equal(await verifyPassword('correct horse battery staple 2026', encoded), true);
  assert.equal(await verifyPassword('wrong password', encoded), false);
  assert.equal(await verifyPassword('correct horse battery staple 2026', 'tampered'), false);
  assert.throws(() => ensureStrongPassword('weak'), /14/);
});
test('session and CSRF secrets are independent random values and only hashed for storage', () => {
  const a = newSecret(), b = newSecret();
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.equal(safeDigestEqual(secretDigest(a), secretDigest(a)), true);
  assert.equal(safeDigestEqual(secretDigest(a), secretDigest(b)), false);
  assert.equal(readSessionCookie('foo=bar; __Host-rakan_session=' + a + '; x=y'), a);
  assert.equal(readSessionCookie('__Host-rakan_session=invalid'), null);
});
test('only valid HTTPS origins or explicit localhost are accepted', () => {
  assert.equal(canonicalOrigin('https://rakan.carpetbazar.org'), 'https://rakan.carpetbazar.org');
  assert.equal(canonicalOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.throws(() => canonicalOrigin('http://rakan.carpetbazar.org'), /HTTPS/);
  assert.throws(() => canonicalOrigin('https://example.com/path'), /origin/);
});
