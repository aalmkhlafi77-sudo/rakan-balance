import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApp } from '../app.mjs';
import { hashPassword } from '../security.mjs';

function buildBundle(pdf, attachment = true) {
  const attachmentId = 'att_1';
  const data = {
    accounts: [{
      id: 'acc_1', name: 'Private account', parentId: null, categoryId: 'cat_1',
      openingBalanceMinor: 0, status: 'active',
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    }],
    categories: [{ id: 'cat_1', name: 'Private', sortOrder: 1 }],
    transactions: [{
      id: 'tx_1', accountId: 'acc_1', entryType: 'owedByAccount', amountMinor: 100,
      date: '2026-11-08', description: 'Private attachment transaction',
      attachmentIds: attachment ? [attachmentId] : [],
      createdAt: '2026-11-08T00:00:00Z', updatedAt: '2026-11-08T00:00:00Z',
    }],
    attachments: attachment ? [{
      id: attachmentId, transactionId: 'tx_1', originalName: 'private.pdf',
      mimeType: 'application/pdf', size: pdf.length,
      dataUrl: 'data:application/pdf;base64,' + pdf.toString('base64'),
      createdAt: '2026-11-08T00:00:00Z',
    }] : [],
    notes: [], dues: [], allocations: [], reminders: [],
  };
  return {
    manifest: {
      formatName: 'RAKAN_BALANCE_BACKUP', backupFormatVersion: 2, schemaVersion: 2,
      exportedAt: '2026-11-08T00:00:00Z', appName: 'RAKAN BALANCE',
      checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      recordCounts: {
        accounts: data.accounts.length, categories: data.categories.length,
        transactions: data.transactions.length, attachments: data.attachments.length,
        notes: 0, dues: 0, allocations: 0, reminders: 0,
      },
    },
    data,
  };
}

test('ledger and private binary attachment commit/delete atomically and download stays owner-only', async () => {
  const password = 'very long binary test password 2026';
  const pwHash = await hashPassword(password);
  const sessions = new Map();
  const limits = new Map();
  const state = {
    ledger: { revision: 0, payload: null, payload_sha256: null },
    blobs: new Map(),
  };
  let failNextBlobInsert = false;

  const pool = {
    async execute(sql, vals = []) {
      if (sql.includes('INSERT INTO owner_login_limits')) {
        limits.set(vals[0], (limits.get(vals[0]) || 0) + 1); return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT attempts,') && sql.includes('owner_login_limits')) {
        return [[{ attempts: limits.get(vals[0]), retry_seconds: 900 }], []];
      }
      if (sql.startsWith('DELETE FROM owner_login_limits')) {
        limits.delete(vals[0]); return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT password_hash')) return [[{ password_hash: pwHash }], []];
      if (sql.startsWith('INSERT INTO owner_sessions')) {
        sessions.set(vals[0], { csrf_hash: vals[1] }); return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('SELECT token_hash')) {
        return [sessions.has(vals[0]) ? [sessions.get(vals[0])] : [], []];
      }
      if (sql.startsWith('SELECT transaction_id, mime_type')) {
        return [state.blobs.has(vals[0]) ? [state.blobs.get(vals[0])] : [], []];
      }
      if (sql.startsWith('SELECT payload, payload_sha256')) {
        return [[{ payload: state.ledger.payload, payload_sha256: state.ledger.payload_sha256 }], []];
      }
      throw new Error('Unexpected top-level query: ' + sql);
    },
    async query() { return [[{}], []]; },
    async getConnection() {
      let txLedger;
      let txBlobs;
      return {
        async beginTransaction() {
          txLedger = { ...state.ledger };
          txBlobs = new Map([...state.blobs].map(([k, v]) => [k, { ...v }]));
        },
        async execute(sql, vals = []) {
          if (sql.startsWith('SELECT revision FROM owner_ledger_snapshot')) {
            return [[{ revision: txLedger.revision }], []];
          }
          if (sql.startsWith('SELECT attachment_id, transaction_id, mime_type, byte_length, sha256 FROM owner_attachment_blobs')) {
            return [[...txBlobs.entries()].map(([attachment_id, row]) => ({
              attachment_id, transaction_id: row.transaction_id, mime_type: row.mime_type,
              byte_length: row.byte_length, sha256: row.sha256,
            })), []];
          }
          if (sql.startsWith('INSERT INTO owner_attachment_blobs')) {
            if (failNextBlobInsert) {
              failNextBlobInsert = false;
              throw new Error('simulated binary storage failure');
            }
            txBlobs.set(vals[0], {
              transaction_id: vals[1], mime_type: vals[2], byte_length: vals[3],
              sha256: vals[4], content: vals[5],
            });
            return [{ affectedRows: 1 }, []];
          }
          if (sql.startsWith('DELETE FROM owner_attachment_blobs')) {
            txBlobs.delete(vals[0]); return [{ affectedRows: 1 }, []];
          }
          if (sql.startsWith('UPDATE owner_ledger_snapshot')) {
            txLedger = { revision: vals[0], payload: vals[1], payload_sha256: vals[2] };
            return [{ affectedRows: 1 }, []];
          }
          throw new Error('Unexpected transactional query: ' + sql);
        },
        async commit() {
          state.ledger = txLedger;
          state.blobs = txBlobs;
        },
        async rollback() {},
        release() {},
      };
    },
  };

  const env = {
    APP_ORIGIN: 'http://127.0.0.1:3000',
    RAKAN_CSRF_SECRET: 'this-test-secret-is-longer-than-32-characters',
  };
  const server = await new Promise(resolve => {
    const s = createApp({ pool, env }).listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const pdf = Buffer.from('%PDF-1.7\nprivate test\n');
  const send = (p, opt = {}) => fetch(base + p, opt);
  try {
    let response = await send('/api/owner/attachment-blobs/att_1');
    assert.equal(response.status, 401);

    response = await send('/api/auth/login', {
      method: 'POST',
      headers: { Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const csrf = (await response.json()).csrfToken;
    const headers = {
      Cookie: cookie, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json',
      'x-csrf-token': csrf,
    };

    response = await send('/api/owner/ledger', {
      method: 'PUT',
      headers: { Cookie: cookie, Origin: env.APP_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0, bundle: buildBundle(pdf) }),
    });
    assert.equal(response.status, 403);
    assert.equal(state.ledger.revision, 0);
    assert.equal(state.blobs.size, 0);

    response = await send('/api/owner/ledger', {
      method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 0, bundle: buildBundle(pdf) }),
    });
    assert.equal(response.status, 200);
    assert.equal(state.ledger.revision, 1);
    assert.equal(state.blobs.size, 1);
    const stored = JSON.parse(Buffer.from(state.ledger.payload).toString('utf8'));
    assert.equal(stored.data.attachments[0].dataUrl, 'rakan-private://attachment/att_1');

    response = await send('/api/owner/attachment-blobs/att_1', { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');

    // A binary failure rolls back the whole financial revision.
    const secondPdf = Buffer.from('%PDF-1.7\nreplacement test\n');
    const second = buildBundle(secondPdf);
    second.data.attachments[0].id = 'att_2';
    second.data.transactions[0].attachmentIds = ['att_2'];
    second.manifest.checksum = createHash('sha256').update(JSON.stringify(second.data)).digest('hex');
    failNextBlobInsert = true;
    response = await send('/api/owner/ledger', {
      method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 1, bundle: second }),
    });
    assert.equal(response.status, 503);
    assert.equal(state.ledger.revision, 1);
    assert.equal(state.blobs.has('att_1'), true);
    assert.equal(state.blobs.has('att_2'), false);

    // Removing metadata and its binary row is one commit.
    response = await send('/api/owner/ledger', {
      method: 'PUT', headers,
      body: JSON.stringify({ expectedRevision: 1, bundle: buildBundle(pdf, false) }),
    });
    assert.equal(response.status, 200);
    assert.equal(state.ledger.revision, 2);
    assert.equal(state.blobs.size, 0);
    response = await send('/api/owner/attachment-blobs/att_1', { headers: { Cookie: cookie } });
    assert.equal(response.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
