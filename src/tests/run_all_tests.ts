/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Test Suite Runner (CLI)
 * Executes all 8 verification tests in Node.js environment with fake-indexeddb
 * Plus verifies absolute isolation against the production database (RakanBalanceDB_v2)
 */

import 'fake-indexeddb/auto';
import { runFinancialVerificationSuite } from '../domain/financial_rules_spec.ts';
import {
  dbStorage,
  DB_NAME,
  STORES_DEMO,
  STORES_REAL,
} from '../storage/indexed_db.ts';
import { computeSHA256 } from '../storage/backup_service.ts';
import {
  AccountModel,
  AttachmentModel,
  CategoryModel,
  StickyNoteModel,
  TransactionModel,
} from '../domain/types.ts';

async function main() {
  console.log('='.repeat(80));
  console.log('   RAKAN BALANCE — AUTOMATED VERIFICATION TEST SUITE (N0 MILESTONE)   ');
  console.log('='.repeat(80));
  console.log(`Production Database Name: ${DB_NAME}`);
  console.log('Verifying absolute isolation between test suite and production data...\n');

  // =========================================================================
  // STEP 1: Seed probe user records into production database (RakanBalanceDB_v2)
  // =========================================================================
  const probeAccount: AccountModel = {
    id: 'user_live_account_canary',
    name: 'حساب المستخدم الحي الفعلي',
    parentId: null,
    categoryId: 'cat_live_1',
    openingBalanceMinor: 99900,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const probeCategory: CategoryModel = {
    id: 'cat_live_1',
    name: 'تصنيف حي فعلي',
    sortOrder: 1,
  };

  const probeTx: TransactionModel = {
    id: 'user_live_tx_canary',
    accountId: 'user_live_account_canary',
    entryType: 'owedByAccount',
    amountMinor: 45000,
    date: '2026-11-06',
    description: 'حركة المستخدم الحية الأصلية',
    attachmentIds: ['user_live_att_canary'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const probeAtt: AttachmentModel = {
    id: 'user_live_att_canary',
    transactionId: 'user_live_tx_canary',
    originalName: 'invoice.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    dataUrl: 'data:application/pdf;base64,TElWRV9EQVRB',
    createdAt: new Date().toISOString(),
  };

  const probeNote: StickyNoteModel = {
    id: 'user_live_note_canary',
    title: 'ملاحظة المستخدم الحقيقية',
    content: 'يجب ألا تمس نهائياً عند فتح شاشة الاختبارات أو تشغيلها',
    color: 'emerald',
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const probeDemoNote: StickyNoteModel = {
    id: 'user_demo_note_canary',
    title: 'ملاحظة التجربة الخاصة بالمستخدم',
    content: 'يجب ألا تمسح عند تشغيل حزمة الاختبارات',
    color: 'amber',
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await dbStorage.put(STORES_REAL.ACCOUNTS, probeAccount);
  await dbStorage.put(STORES_REAL.CATEGORIES, probeCategory);
  await dbStorage.put(STORES_REAL.TRANSACTIONS, probeTx);
  await dbStorage.put(STORES_REAL.ATTACHMENTS, probeAtt);
  await dbStorage.put(STORES_REAL.NOTES, probeNote);
  await dbStorage.put(STORES_DEMO.NOTES, probeDemoNote);

  // Take snapshot of production database before running tests
  const [prodAccsBefore, prodCatsBefore, prodTxsBefore, prodAttsBefore, prodNotesBefore, prodDemoNotesBefore] =
    await Promise.all([
      dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
      dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
      dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
      dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
      dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
      dbStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES),
    ]);

  const prodFingerprintBefore = await computeSHA256(
    JSON.stringify({
      prodAccsBefore,
      prodCatsBefore,
      prodTxsBefore,
      prodAttsBefore,
      prodNotesBefore,
      prodDemoNotesBefore,
    })
  );

  console.log(`[PROD BASELINE] Fingerprint before test suite: ${prodFingerprintBefore}`);
  console.log(`[PROD BASELINE] Real accounts: ${prodAccsBefore.length}, Demo notes: ${prodDemoNotesBefore.length}`);
  console.log('Running test suite (all tests execute on an ephemeral isolated database)...\n');

  // =========================================================================
  // STEP 2: Execute test suite
  // =========================================================================
  const startTime = Date.now();
  const results = await runFinancialVerificationSuite();
  const elapsedMs = Date.now() - startTime;

  let passedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const t = results[i];
    const statusTag = t.passed ? '[PASS]' : '[FAIL]';
    if (t.passed) {
      passedCount++;
    } else {
      failedCount++;
    }

    console.log(`${statusTag} #${i + 1}: ${t.title}`);
    console.log(`       المتوقع: ${t.expected}`);
    console.log(`       الفعلي : ${t.actual}`);
    if (t.details) {
      console.log(`       تفاصيل : ${t.details}`);
    }
    console.log('-'.repeat(80));
  }

  // =========================================================================
  // STEP 3: Verify zero touch / zero pollution on production database
  // =========================================================================
  const [prodAccsAfter, prodCatsAfter, prodTxsAfter, prodAttsAfter, prodNotesAfter, prodDemoNotesAfter] =
    await Promise.all([
      dbStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
      dbStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
      dbStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
      dbStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
      dbStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
      dbStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES),
    ]);

  const prodFingerprintAfter = await computeSHA256(
    JSON.stringify({
      prodAccsBefore: prodAccsAfter,
      prodCatsBefore: prodCatsAfter,
      prodTxsBefore: prodTxsAfter,
      prodAttsBefore: prodAttsAfter,
      prodNotesBefore: prodNotesAfter,
      prodDemoNotesBefore: prodDemoNotesAfter,
    })
  );

  const fingerprintsMatch = prodFingerprintBefore === prodFingerprintAfter;
  const demoNoteStillPreserved = prodDemoNotesAfter.some((n) => n.id === 'user_demo_note_canary');
  const realAccountStillPreserved = prodAccsAfter.some((a) => a.id === 'user_live_account_canary');
  const realTxStillPreserved = prodTxsAfter.some((t) => t.id === 'user_live_tx_canary');

  console.log('\n' + '='.repeat(80));
  console.log('   PRODUCTION DATABASE ISOLATION VERIFICATION (ZERO-POLLUTION PROOF)   ');
  console.log('='.repeat(80));
  console.log(`Fingerprint Match: ${fingerprintsMatch ? 'YES (100% IDENTICAL)' : 'NO (DETECTED POLLUTION!)'}`);
  console.log(`User Real Account Preserved: ${realAccountStillPreserved ? 'YES' : 'NO'}`);
  console.log(`User Real Transaction Preserved: ${realTxStillPreserved ? 'YES' : 'NO'}`);
  console.log(`User Demo Note Preserved (Not wiped by purge): ${demoNoteStillPreserved ? 'YES' : 'NO'}`);
  console.log(`Production DB Name Checked: ${dbStorage.getDatabaseName()}`);
  console.log('='.repeat(80));

  // Clean up probe records from production database
  await dbStorage.delete(STORES_REAL.ACCOUNTS, probeAccount.id);
  await dbStorage.delete(STORES_REAL.CATEGORIES, probeCategory.id);
  await dbStorage.delete(STORES_REAL.TRANSACTIONS, probeTx.id);
  await dbStorage.delete(STORES_REAL.ATTACHMENTS, probeAtt.id);
  await dbStorage.delete(STORES_REAL.NOTES, probeNote.id);
  await dbStorage.delete(STORES_DEMO.NOTES, probeDemoNote.id);

  console.log(`\nTEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED, 0 PENDING (Total: ${results.length})`);
  console.log(`Time elapsed: ${elapsedMs}ms`);

  if (!fingerprintsMatch || !demoNoteStillPreserved || !realAccountStillPreserved) {
    console.error('\nSECURITY CRITICAL ERROR: The test suite modified production database records!');
    process.exit(1);
  }

  if (failedCount > 0) {
    console.error(`\nFAILED: ${failedCount} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nSUCCESS: All 8 invariant tests passed & 100% database isolation verified.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
