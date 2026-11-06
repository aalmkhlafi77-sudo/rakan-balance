/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Test Suite Runner (CLI)
 * Executes all 10 verification tests in Node.js environment with fake-indexeddb
 * Uses a dedicated simulated environment database (NEVER creates test records in RakanBalanceDB_v2)
 * Ensures complete cleanup in all failure and success scenarios without calling process.exit inside try/finally.
 */

import 'fake-indexeddb/auto';
import { runFinancialVerificationSuite } from '../domain/financial_rules_spec.ts';
import {
  createIsolatedTestStorage,
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

async function main(): Promise<number> {
  console.log('='.repeat(80));
  console.log('   RAKAN BALANCE — AUTOMATED VERIFICATION TEST SUITE (N0 MILESTONE)   ');
  console.log('='.repeat(80));
  console.log(`Production Database Name: ${DB_NAME}`);
  console.log('Testing data fingerprint isolation using dedicated simulated user environment...\n');

  let exitCode = 0;

  // Dedicated simulated user environment storage instance (NEVER targets database named RakanBalanceDB_v2)
  const simulatedUserStorage = createIsolatedTestStorage('RakanBalance_SimulatedUserEnvDB');
  const simulatedDbName = simulatedUserStorage.getDatabaseName();

  // Safety invariant check: Simulated DB name must NEVER equal production DB name!
  if (simulatedDbName === DB_NAME) {
    throw new Error('Fatal Security Violation: Simulated user environment matches production database name!');
  }

  try {
    // 1. Seed probe user records into simulated user environment
    const probeAccount: AccountModel = {
      id: 'sim_user_account_canary',
      name: 'حساب المستخدم المحاكى الفعلي',
      parentId: null,
      categoryId: 'cat_sim_1',
      openingBalanceMinor: 99900,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const probeCategory: CategoryModel = {
      id: 'cat_sim_1',
      name: 'تصنيف محاكى فعلي',
      sortOrder: 1,
    };

    const probeTx: TransactionModel = {
      id: 'sim_user_tx_canary',
      accountId: 'sim_user_account_canary',
      entryType: 'owedByAccount',
      amountMinor: 45000,
      date: '2026-11-06',
      description: 'حركة المستخدم المحاكاة الأصلية',
      attachmentIds: ['sim_user_att_canary'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const probeAtt: AttachmentModel = {
      id: 'sim_user_att_canary',
      transactionId: 'sim_user_tx_canary',
      originalName: 'invoice.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      dataUrl: 'data:application/pdf;base64,TElWRV9EQVRB',
      createdAt: new Date().toISOString(),
    };

    const probeNote: StickyNoteModel = {
      id: 'sim_user_note_canary',
      title: 'ملاحظة المستخدم الحقيقية',
      content: 'يجب ألا تمس نهائياً عند فتح شاشة الاختبارات أو تشغيلها',
      color: 'emerald',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const probeDemoNote: StickyNoteModel = {
      id: 'sim_user_demo_note_canary',
      title: 'ملاحظة التجربة الخاصة بالمستخدم',
      content: 'يجب ألا تمسح عند تشغيل حزمة الاختبارات',
      color: 'amber',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await simulatedUserStorage.put(STORES_REAL.ACCOUNTS, probeAccount);
    await simulatedUserStorage.put(STORES_REAL.CATEGORIES, probeCategory);
    await simulatedUserStorage.put(STORES_REAL.TRANSACTIONS, probeTx);
    await simulatedUserStorage.put(STORES_REAL.ATTACHMENTS, probeAtt);
    await simulatedUserStorage.put(STORES_REAL.NOTES, probeNote);
    await simulatedUserStorage.put(STORES_DEMO.NOTES, probeDemoNote);

    // Compute baseline fingerprint of simulated user environment before running tests
    const [accsBefore, catsBefore, txsBefore, attsBefore, notesBefore, demoNotesBefore] =
      await Promise.all([
        simulatedUserStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
        simulatedUserStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
        simulatedUserStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
        simulatedUserStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
        simulatedUserStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
        simulatedUserStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES),
      ]);

    const fingerprintBefore = await computeSHA256(
      JSON.stringify({ accsBefore, catsBefore, txsBefore, attsBefore, notesBefore, demoNotesBefore })
    );

    console.log(`[SIMULATED ENV BASELINE] Fingerprint before test suite: ${fingerprintBefore}`);
    console.log(`[SIMULATED ENV BASELINE] Accounts: ${accsBefore.length}, Demo notes: ${demoNotesBefore.length}`);
    console.log('Running test suite (all tests execute on an ephemeral isolated test database)...\n');

    // 2. Execute test suite
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

    // 3. Verify zero touch / zero pollution on simulated user environment
    const [accsAfter, catsAfter, txsAfter, attsAfter, notesAfter, demoNotesAfter] =
      await Promise.all([
        simulatedUserStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS),
        simulatedUserStorage.getAll<CategoryModel>(STORES_REAL.CATEGORIES),
        simulatedUserStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS),
        simulatedUserStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS),
        simulatedUserStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES),
        simulatedUserStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES),
      ]);

    const fingerprintAfter = await computeSHA256(
      JSON.stringify({
        accsBefore: accsAfter,
        catsBefore: catsAfter,
        txsBefore: txsAfter,
        attsBefore: attsAfter,
        notesBefore: notesAfter,
        demoNotesBefore: demoNotesAfter,
      })
    );

    const fingerprintsMatch = fingerprintBefore === fingerprintAfter;
    const demoNotePreserved = demoNotesAfter.some((n) => n.id === 'sim_user_demo_note_canary');
    const realAccountPreserved = accsAfter.some((a) => a.id === 'sim_user_account_canary');
    const realTxPreserved = txsAfter.some((t) => t.id === 'sim_user_tx_canary');

    console.log('\n' + '='.repeat(80));
    console.log('   DATA ISOLATION VERIFICATION (ZERO-POLLUTION PROOF)   ');
    console.log('='.repeat(80));
    console.log(`Simulated User DB Name: ${simulatedDbName}`);
    console.log(`Fingerprint Match: ${fingerprintsMatch ? 'YES (100% IDENTICAL)' : 'NO (DETECTED POLLUTION!)'}`);
    console.log(`Simulated Real Account Preserved: ${realAccountPreserved ? 'YES' : 'NO'}`);
    console.log(`Simulated Real Transaction Preserved: ${realTxPreserved ? 'YES' : 'NO'}`);
    console.log(`Simulated Demo Note Preserved: ${demoNotePreserved ? 'YES' : 'NO'}`);
    console.log('='.repeat(80));

    console.log(`\nTEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED, 0 PENDING (Total: ${results.length})`);
    console.log(`Time elapsed: ${elapsedMs}ms`);

    if (!fingerprintsMatch || !demoNotePreserved || !realAccountPreserved || !realTxPreserved) {
      console.error('\nSECURITY CRITICAL ERROR: The test suite modified user environment data!');
      exitCode = 1;
    } else if (failedCount > 0) {
      console.error(`\nFAILED: ${failedCount} test(s) failed.`);
      exitCode = 1;
    } else {
      console.log(`\nSUCCESS: All ${results.length} invariant tests passed & 100% data isolation verified.`);
      exitCode = 0;
    }
  } finally {
    // ALWAYS destroy simulatedUserStorage in finally block to ensure complete cleanup in all cases
    try {
      await simulatedUserStorage.destroyDatabase();
    } catch (cleanErr: any) {
      console.error('Failed to cleanup simulated user environment database:', cleanErr);
      exitCode = 1;
    }
  }

  return exitCode;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  })
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
