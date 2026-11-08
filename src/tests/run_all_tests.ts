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
import { runGoldenFixturesTests } from '../../tests/fixtures/run_golden_fixtures_test.ts';
import { runWebLedgerImportTestSuite } from './web_ledger_import_spec.ts';
import { runWebCurrencySetupTestSuite } from './web_currency_setup_spec.ts';
import { runWebReportsTestSuite } from './web_financial_reports_spec.ts';
import { runWebAttachmentsTestSuite } from './web_attachments_spec.ts';
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
  console.log('   RAKAN BALANCE — AUTOMATED VERIFICATION TEST SUITE (N1 MILESTONE)   ');
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

    // 3. Execute Golden Fixtures Reference Verification Suite
    console.log('\n' + '='.repeat(80));
    console.log('   RAKAN BALANCE — GOLDEN FINANCIAL FIXTURES TEST SUITE   ');
    console.log('='.repeat(80));
    const goldenResults = await runGoldenFixturesTests();
    for (const gr of goldenResults.results) {
      console.log(`[${gr.passed ? 'PASS' : 'FAIL'}] ${gr.id}: ${gr.name}`);
      console.log(`       ${gr.message}`);
    }
    console.log('-'.repeat(80));
    console.log(`GOLDEN SUMMARY: ${goldenResults.passedCount} PASSED, ${goldenResults.failedCount} FAILED (Total: ${goldenResults.results.length})`);

    // 4. Execute Web CSV/XLSX Ledger Import Verification Suite (WEB-F1)
    console.log('\n');
    const webImportResults = await runWebLedgerImportTestSuite();

    // 5. Execute Web Currency & Initial Setup Verification Suite (WEB-F2)
    console.log('\n');
    const webCurrencyResults = await runWebCurrencySetupTestSuite();

    // 6. Execute Web Financial Reports Verification Suite (WEB-F3)
    console.log('\n' + '='.repeat(80));
    console.log('   RAKAN BALANCE — WEB FINANCIAL REPORTS TEST SUITE (WEB-F3)   ');
    console.log('='.repeat(80));
    const webReportsResults = await runWebReportsTestSuite();
    for (const r of webReportsResults.results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name}`);
      console.log(`       ${r.message}`);
    }
    console.log('-'.repeat(80));
    console.log(`WEB-F3 REPORTS SUMMARY: ${webReportsResults.passedCount} PASSED, ${webReportsResults.failedCount} FAILED (Total: ${webReportsResults.results.length})`);

    // 7. Execute Web Attachments Verification Suite (WEB-F5)
    console.log('\n' + '='.repeat(80));
    console.log('   RAKAN BALANCE — WEB ATTACHMENTS TEST SUITE (WEB-F5)   ');
    console.log('='.repeat(80));
    const webAttachmentsResults = await runWebAttachmentsTestSuite();
    for (const r of webAttachmentsResults.results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name}`);
      console.log(`       ${r.message}`);
    }
    console.log('-'.repeat(80));
    console.log(`WEB-F5 ATTACHMENTS SUMMARY: ${webAttachmentsResults.passedCount} PASSED, ${webAttachmentsResults.failedCount} FAILED (Total: ${webAttachmentsResults.results.length})`);

    // 8. Verify zero touch / zero pollution on simulated user environment
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

    const totalWebCurrency = webCurrencyResults.passedCount + webCurrencyResults.failedCount;
    const totalWebReports = webReportsResults.passedCount + webReportsResults.failedCount;
    const totalWebAttachments = webAttachmentsResults.passedCount + webAttachmentsResults.failedCount;
    console.log(`\nTEST SUMMARY: Invariants (${passedCount}/${results.length}) | Golden Fixtures (${goldenResults.passedCount}/${goldenResults.results.length}) | Web Import (${webImportResults.passed}/${webImportResults.passed + webImportResults.failed}) | Web Currency & Setup (${webCurrencyResults.passedCount}/${totalWebCurrency}) | Web Reports (${webReportsResults.passedCount}/${totalWebReports}) | Web Attachments (${webAttachmentsResults.passedCount}/${totalWebAttachments})`);
    console.log(`Time elapsed: ${elapsedMs}ms`);

    if (!fingerprintsMatch || !demoNotePreserved || !realAccountPreserved || !realTxPreserved) {
      console.error('\nSECURITY CRITICAL ERROR: The test suite modified user environment data!');
      exitCode = 1;
    } else if (failedCount > 0 || goldenResults.failedCount > 0 || webImportResults.failed > 0 || webCurrencyResults.failedCount > 0 || webReportsResults.failedCount > 0 || webAttachmentsResults.failedCount > 0) {
      console.error(`\nFAILED: Invariant failures: ${failedCount}, Golden failures: ${goldenResults.failedCount}, Web Import failures: ${webImportResults.failed}, Web Currency failures: ${webCurrencyResults.failedCount}, Web Reports failures: ${webReportsResults.failedCount}, Web Attachments failures: ${webAttachmentsResults.failedCount}.`);
      exitCode = 1;
    } else {
      console.log(`\nSUCCESS: All ${results.length} invariant tests, all ${goldenResults.results.length} golden fixtures, all ${webImportResults.passed} web import tests, all ${webCurrencyResults.passedCount} web currency tests, all ${webReportsResults.passedCount} web report tests, AND all ${webAttachmentsResults.passedCount} web attachment tests passed & 100% data isolation verified.`);
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
