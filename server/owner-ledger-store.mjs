import { validateOwnerLedger } from './ledger-validation.mjs';

export class RevisionConflict extends Error {
  constructor(revision) { super('Owner ledger changed on another device.'); this.revision = revision; }
}
export function parseRevision(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Unsupported ledger revision');
  return n;
}

export function createOwnerLedgerStore(pool) {
  return {
    async read() {
      const [rows] = await pool.execute('SELECT revision, payload FROM owner_ledger_state WHERE id = 1 LIMIT 1');
      if (rows.length !== 1) throw new Error('Owner ledger migration missing');
      return { revision: parseRevision(rows[0].revision), data: JSON.parse(rows[0].payload) };
    },
    async write(expectedRevision, rawData) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error('Invalid expected revision');
      }
      const data = validateOwnerLedger(rawData);
      const payload = JSON.stringify(data);
      if (Buffer.byteLength(payload, 'utf8') > 20 * 1024 * 1024) {
        throw new Error('Ledger snapshot exceeds configured 20 MB limit');
      }
      const db = await pool.getConnection();
      let active = false;
      try {
        await db.beginTransaction();
        active = true;
        const [rows] = await db.execute('SELECT revision FROM owner_ledger_state WHERE id = 1 FOR UPDATE');
        if (rows.length !== 1) throw new Error('Owner ledger migration missing');
        const revision = parseRevision(rows[0].revision);
        if (revision !== expectedRevision) throw new RevisionConflict(revision);
        await db.execute('UPDATE owner_ledger_state SET revision = ?, payload = ? WHERE id = 1',
          [revision + 1, payload]);
        await db.commit();
        active = false;
        return { revision: revision + 1 };
      } catch (err) {
        if (active) await db.rollback();
        throw err;
      } finally {
        db.release();
      }
    },
  };
}
