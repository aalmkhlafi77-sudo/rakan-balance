import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptOwnerBackup, decryptOwnerBackup } from '../backup-crypto.mjs';

const key = 'long offline-only testing passphrase 2026';
test('private encrypted snapshot roundtrip and randomized encryption', async () => {
  const value = { revision: 17, payload: '{"accounts":[],"transactions":[]}' };
  const first = await encryptOwnerBackup(value, key);
  const second = await encryptOwnerBackup(value, key);
  assert.notEqual(first, second);
  assert.deepEqual(await decryptOwnerBackup(first, key), {
    revision: 17,
    payload: value.payload,
    payload_sha256: '3f96d24357fbe9739f18160f8d0ca3c089258685bc32c6017b7e778068b8239',
  });
});
test('encrypted backup rejects corrupted bytes and incorrect passphrases', async () => {
  const value = { revision: 3, payload: null };
  const encrypted = await encryptOwnerBackup(value, key);
  await assert.rejects(() => decryptOwnerBackup(encrypted, 'a different long offline testing passphrase'), /auth|authenticate|Unsupported|decrypt/i);
  const bad = JSON.parse(encrypted);
  const data = Buffer.from(bad.ciphertext, 'base64');
  data[0] ^= 1;
  bad.ciphertext = data.toString('base64');
  await assert.rejects(() => decryptOwnerBackup(JSON.stringify(bad), key));
  await assert.rejects(() => encryptOwnerBackup(value, 'weak'));
});
