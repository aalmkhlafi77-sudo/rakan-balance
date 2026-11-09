import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
    payload_sha256: createHash('sha256').update(value.payload).digest('hex'),
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


test('encrypted backup preserves verified linked private attachment binary', async () => {
  const binary = Buffer.from('%PDF-1.7\\nprivate-attachment');
  const sha256 = createHash('sha256').update(binary).digest('hex');
  const payload = JSON.stringify({data:{
    transactions:[{id:'tx_1',attachmentIds:['att_1']}],
    attachments:[{id:'att_1',transactionId:'tx_1'}],
  }});
  const record = {
    attachmentId:'att_1', transactionId:'tx_1',mimeType:'application/pdf',
    sha256,base64:binary.toString('base64'),
  };
  const encrypted = await encryptOwnerBackup({revision:2,payload,attachments:[record]},key);
  const restored = await decryptOwnerBackup(encrypted,key);
  assert.deepEqual(restored.attachments,[record]);
  const wrong = {...record,sha256:'0'.repeat(64)};
  await assert.rejects(()=>encryptOwnerBackup({revision:2,payload,attachments:[wrong]},key));
  await assert.rejects(()=>encryptOwnerBackup({
    revision:2,payload,attachments:[{...record,transactionId:'missing'}],
  },key));
});
