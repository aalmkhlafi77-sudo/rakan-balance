import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerLedgerStore, RevisionConflict } from '../owner-ledger-store.mjs';
import { InvalidLedger, validateOwnerLedger } from '../ledger-validation.mjs';

const EMPTY = {
  accounts:[], categories:[], transactions:[], attachments:[],
  notes:[], dues:[], allocations:[], reminders:[], settings:{},
};
const CAT = {id:'c',name:'عام',sortOrder:1};
const ACCOUNT = {
  id:'a',name:'حساب',parentId:null,categoryId:'c',openingBalanceMinor:0,
  status:'active',createdAt:'2026-11-08T00:00:00Z',updatedAt:'2026-11-08T00:00:00Z',
};
function valid() { return JSON.parse(JSON.stringify({
  ...EMPTY, categories:[CAT], accounts:[ACCOUNT],
  transactions:[{id:'t',accountId:'a',entryType:'owedByAccount',amountMinor:300,
    date:'2026-11-08',description:'مصروف',attachmentIds:[],
    createdAt:'2026-11-08T00:00:00Z',updatedAt:'2026-11-08T00:00:00Z'}],
})); }

test('server rejects malformed amounts, orphan records, demo rows and account cycles', () => {
  const badAmount=valid(); badAmount.transactions[0].amountMinor=1.25;
  assert.throws(()=>validateOwnerLedger(badAmount), InvalidLedger);
  const orphan=valid(); orphan.transactions[0].accountId='missing';
  assert.throws(()=>validateOwnerLedger(orphan), InvalidLedger);
  const demo=valid(); demo.accounts[0].isDemo=true;
  assert.throws(()=>validateOwnerLedger(demo), InvalidLedger);
  const cycle=valid(); cycle.accounts[0].parentId='a';
  assert.throws(()=>validateOwnerLedger(cycle), InvalidLedger);
  const secrets=valid(); secrets.settings.pinCodeHash='not_allowed';
  assert.throws(()=>validateOwnerLedger(secrets), InvalidLedger);
});

test('server accepts valid mirrored transfers and rejects incomplete ones', () => {
  const data=valid();data.accounts.push({...ACCOUNT,id:'b',name:'حساب ثان'});
  data.transactions.push(
    {...data.transactions[0],id:'src',accountId:'a',transferId:'x',
      transferRole:'source',counterpartyAccountId:'b',entryType:'owedToAccount'},
    {...data.transactions[0],id:'dst',accountId:'b',transferId:'x',
      transferRole:'destination',counterpartyAccountId:'a',entryType:'owedByAccount'});
  assert.doesNotThrow(()=>validateOwnerLedger(data));
  data.transactions.pop();
  assert.throws(()=>validateOwnerLedger(data),InvalidLedger);
});

function database() {
  const ledger={revision:0,payload:JSON.stringify(EMPTY)};
  let previous, locked=false, updateCount=0;
  const connection={
    async beginTransaction(){ if(locked)throw Error('overlapping test transaction');locked=true; previous={...ledger}; },
    async execute(sql,params=[]){
      if(sql.includes('FOR UPDATE'))return [[{revision:ledger.revision}],[]];
      if(sql.startsWith('UPDATE')) {
        ledger.revision=params[0];ledger.payload=params[1];updateCount++;
        return [{affectedRows:1},[]];
      }
      throw Error('Unknown SQL '+sql);
    },
    async rollback(){ Object.assign(ledger,previous);locked=false; },
    async commit(){locked=false;},
    release(){},
  };
  return {ledger,get updateCount(){return updateCount;},
    pool:{
      async execute(sql){if(sql.startsWith('SELECT revision, payload'))return [[{...ledger}],[]]; throw Error('Unexpected SQL');},
      async getConnection(){return connection;},
    },
  };
}

test('MySQL storage saves an atomic versioned snapshot and rejects stale versions',async()=>{
  const mock=database();const store=createOwnerLedgerStore(mock.pool);
  assert.deepEqual(await store.read(),{revision:0,data:EMPTY});
  assert.deepEqual(await store.write(0,valid()),{revision:1});
  const saved=await store.read();
  assert.equal(saved.data.transactions[0].amountMinor,300);
  await assert.rejects(()=>store.write(0,valid()),RevisionConflict);
  assert.equal((await store.read()).revision,1);
  const invalid=valid();invalid.transactions[0].amountMinor=0.5;
  await assert.rejects(()=>store.write(1,invalid),InvalidLedger);
  assert.equal(mock.updateCount,1);
  assert.equal((await store.read()).data.transactions[0].amountMinor,300);
  assert.deepEqual(await store.write(1,valid()),{revision:2});
});
