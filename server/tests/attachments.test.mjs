import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../app.mjs';
import { hashPassword, secretDigest } from '../security.mjs';

test('binary upload and download require owner auth, CSRF, real ledger link and immutable content', async () => {
  const password = 'very long binary test password 2026';
  const pwHash = await hashPassword(password);
  const sessions = new Map();
  const limits = new Map();
  const blobs = new Map();
  const bundle = { data: {
    accounts: [], categories: [], transactions: [{id:'tx_1', attachmentIds:['att_1']}],
    attachments:[{id:'att_1', transactionId:'tx_1'}], notes:[], dues:[], allocations:[], reminders:[],
  }};
  const raw = Buffer.from(JSON.stringify(bundle));
  const ledgerHash = createHash('sha256').update(raw).digest('hex');
  const pool = {
    async execute(sql, vals=[]) {
      if (sql.includes('INSERT INTO owner_login_limits')) { limits.set(vals[0],(limits.get(vals[0])||0)+1); return [{affectedRows:1}]; }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) return [[{attempts:limits.get(vals[0]),retry_seconds:900}]];
      if (sql.startsWith('DELETE FROM owner_login_limits')) {limits.delete(vals[0]);return [{affectedRows:1}];}
      if (sql.startsWith('SELECT password_hash')) return [[{password_hash:pwHash}]];
      if (sql.startsWith('INSERT INTO owner_sessions')) {sessions.set(vals[0],{csrf_hash:vals[1]});return [{affectedRows:1}];}
      if (sql.startsWith('SELECT token_hash')) return [sessions.has(vals[0])?[sessions.get(vals[0])]:[]];
      if (sql.startsWith('SELECT payload, payload_sha256')) return [[{payload:raw,payload_sha256:ledgerHash}]];
      if (sql.startsWith('INSERT INTO owner_attachment_blobs')) {
        if(blobs.has(vals[0])) {const error=new Error('duplicate');error.code='ER_DUP_ENTRY';throw error;}
        blobs.set(vals[0],{transaction_id:vals[1],mime_type:vals[2],byte_length:vals[3],sha256:vals[4],content:vals[5]});
        return [{affectedRows:1}];
      }
      if (sql.startsWith('SELECT transaction_id, mime_type')) return [blobs.has(vals[0])?[blobs.get(vals[0])]:[]];
      throw new Error('Unexpected query: '+sql);
    },
    async query(){return [[{}]];},
  };
  const env={APP_ORIGIN:'http://127.0.0.1:3000',RAKAN_CSRF_SECRET:'this-test-secret-is-longer-than-32-characters'};
  const server=await new Promise(resolve=>{
    const s=createApp({pool,env}).listen(0,'127.0.0.1',()=>resolve(s));
  });
  const base='http://127.0.0.1:'+server.address().port;
  const pdf=Buffer.from('%PDF-1.7\nprivate test\n');
  const send=(p,opt={})=>fetch(base+p,opt);
  try{
    let r=await send('/api/owner/attachment-blobs/att_1');
    assert.equal(r.status,401);
    r=await send('/api/auth/login',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({password})});
    assert.equal(r.status,200);
    const cookie=r.headers.get('set-cookie').split(';')[0];
    const csrf=(await r.json()).csrfToken;
    const headers={Cookie:cookie,Origin:env.APP_ORIGIN,'Content-Type':'application/octet-stream','x-transaction-id':'tx_1'};
    r=await send('/api/owner/attachment-blobs/att_1',{method:'PUT',headers,body:pdf});
    assert.equal(r.status,403);
    r=await send('/api/owner/attachment-blobs/att_1',{method:'PUT',headers:{...headers,'x-csrf-token':csrf},body:pdf});
    assert.equal(r.status,201);
    assert.equal(blobs.size,1);
    r=await send('/api/owner/attachment-blobs/att_1',{headers:{Cookie:cookie}});
    assert.equal(r.status,200);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()),pdf);
    r=await send('/api/owner/attachment-blobs/att_1',{method:'PUT',headers:{...headers,'x-csrf-token':csrf},body:pdf});
    assert.equal(r.status,409);
    r=await send('/api/owner/attachment-blobs/att_not_linked',{method:'PUT',headers:{...headers,'x-csrf-token':csrf},body:pdf});
    assert.equal(r.status,409);
    r=await send('/api/owner/attachment-blobs/att_other',{method:'PUT',
      headers:{...headers,'x-csrf-token':csrf},body:Buffer.from('<svg onload=alert(1)>')});
    assert.equal(r.status,415);
    blobs.get('att_1').sha256='0'.repeat(64);
    r=await send('/api/owner/attachment-blobs/att_1',{headers:{Cookie:cookie}});
    assert.equal(r.status,503);
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
});
