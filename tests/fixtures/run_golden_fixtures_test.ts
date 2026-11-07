/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Golden Fixtures Verification Runner
 * Verifies that the production financial calculation engine satisfies all 10 Golden Reference Fixtures
 * with full atomic lifecycle checks (IndexedDB isolated test storage) and authentic corrupt backup rejection.
 * STRICTLY executes on ephemeral test storage; NEVER touches production RakanBalanceDB_v2!
 */

import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  calculateAccountBalance,
  calculateAccountStatement,
  calculateDashboardSummary,
} from '../../src/domain/balance_calculator.ts';
import { tryToMinorUnits, MAX_SAFE_MINOR_AMOUNT, formatMinorAmount } from '../../src/domain/money.ts';
import {
  buildTransferEntries,
  validateInterAccountTransfer,
  validateTransferPairs,
} from '../../src/domain/inter_account_transfer.ts';
import { computeSHA256, validateBackupFile } from '../../src/storage/backup_service.ts';
import {
  createIsolatedTestStorage,
  DB_NAME,
  STORES_REAL,
} from '../../src/storage/indexed_db.ts';
import {
  AccountModel,
  TransactionModel,
  DueItemContract,
  PaymentAllocationContract,
} from '../../src/domain/types.ts';

export interface FixtureTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export async function runGoldenFixturesTests(): Promise<{ passedCount: number; failedCount: number; results: FixtureTestResult[] }> {
  const fixturePath = resolve(process.cwd(), 'tests/fixtures/golden_financial_fixtures.json');
  const fixtureContent = readFileSync(fixturePath, 'utf-8');
  const fixtureData = JSON.parse(fixtureContent);

  const results: FixtureTestResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  function assert(id: string, name: string, condition: boolean, details: string) {
    if (condition) {
      passedCount++;
      results.push({ id, name, passed: true, message: 'PASS: ' + details });
    } else {
      failedCount++;
      results.push({ id, name, passed: false, message: 'FAIL: ' + details });
    }
  }

  // 1. GOLDEN_01_OPENING_BALANCES
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_01_OPENING_BALANCES');
    const accPos = tc.inputs.accounts[0];
    const accNeg = tc.inputs.accounts[1];
    const accZero = tc.inputs.accounts[2];

    const bPos = calculateAccountBalance(accPos, []);
    const bNeg = calculateAccountBalance(accNeg, []);
    const bZero = calculateAccountBalance(accZero, []);

    const summary = calculateDashboardSummary(tc.inputs.accounts, []);

    const ok =
      bPos === tc.expected.balances.acc_pos &&
      bNeg === tc.expected.balances.acc_neg &&
      bZero === tc.expected.balances.acc_zero &&
      summary.totalReceivableMinor === tc.expected.systemSummary.totalOwedByMinor &&
      summary.totalPayableMinor === tc.expected.systemSummary.totalOwedToMinor &&
      summary.netBalanceMinor === tc.expected.systemSummary.netBalanceMinor;

    assert(tc.id, 'Opening balances & system summary', ok,
      `bPos=${bPos}, bNeg=${bNeg}, bZero=${bZero}, net=${summary.netBalanceMinor}`);
  }

  // 2. GOLDEN_02_ENTRY_TYPES_AND_BALANCE_CROSSING
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_02_ENTRY_TYPES_AND_BALANCE_CROSSING');
    const acc = tc.inputs.accounts[0];
    const tx1 = tc.inputs.transactions[0];
    const tx2 = tc.inputs.transactions[1];

    const bAfterTx1 = calculateAccountBalance(acc, [tx1]);
    const bAfterTx2 = calculateAccountBalance(acc, [tx1, tx2]);

    const formatted = formatMinorAmount(bAfterTx2);

    const ok =
      bAfterTx1 === tc.expected.stepBalances[1].balanceMinor &&
      bAfterTx2 === tc.expected.finalBalanceMinor &&
      formatted === tc.expected.humanFormatted;

    assert(tc.id, 'Entry types and balance sign crossing', ok,
      `Step1=${bAfterTx1}, Final=${bAfterTx2}, Formatted=${formatted}`);
  }

  // 3. GOLDEN_03_HALALA_PRECISION_ONE_CENT
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_03_HALALA_PRECISION_ONE_CENT');
    let allParsedMatch = true;

    for (const item of tc.inputs.amountsToParse) {
      const res = tryToMinorUnits(item.input);
      if (item.shouldSucceed) {
        if (!res.success || res.minor !== item.expectedMinor) {
          allParsedMatch = false;
        }
      } else {
        if (res.success) {
          allParsedMatch = false;
        }
      }
    }

    assert(tc.id, 'One halala precision and string parsing', allParsedMatch,
      `Verified ${tc.inputs.amountsToParse.length} amount string inputs including fractions and invalid formats`);
  }

  // 4. GOLDEN_04_MAX_LIMIT_BOUNDARY
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_04_MAX_LIMIT_BOUNDARY');
    const validMax = tryToMinorUnits(tc.inputs.maxValidString);
    const excess = tryToMinorUnits(tc.inputs.excessString);

    const ok =
      validMax.success &&
      validMax.minor === tc.inputs.maxValidMinor &&
      !excess.success &&
      MAX_SAFE_MINOR_AMOUNT === 10000000000000;

    assert(tc.id, 'Boundary limits: 100 Billion SAR acceptance and excess rejection', ok,
      `Valid=${validMax.minor}, ExcessRejected=${!excess.success}`);
  }

  // 5. GOLDEN_05_INDEPENDENT_SUBACCOUNTS
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_05_INDEPENDENT_SUBACCOUNTS');
    const parent = tc.inputs.accounts[0];
    const child1 = tc.inputs.accounts[1];
    const child2 = tc.inputs.accounts[2];

    const bParent = calculateAccountBalance(parent, tc.inputs.transactions);
    const bChild1 = calculateAccountBalance(child1, tc.inputs.transactions);
    const bChild2 = calculateAccountBalance(child2, tc.inputs.transactions);

    const summary = calculateDashboardSummary(tc.inputs.accounts, tc.inputs.transactions);

    const ok =
      bParent === tc.expected.accountBalances.acc_parent &&
      bChild1 === tc.expected.accountBalances.acc_child_1 &&
      bChild2 === tc.expected.accountBalances.acc_child_2 &&
      summary.netBalanceMinor === tc.expected.systemSummary.netBalanceMinor;

    assert(tc.id, 'Independent subaccounts with no double counting', ok,
      `Parent=${bParent}, Child1=${bChild1}, Child2=${bChild2}, Net=${summary.netBalanceMinor}`);
  }

  // 6. GOLDEN_06_INTER_ACCOUNT_TRANSFER_INVARIANCE
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_06_INTER_ACCOUNT_TRANSFER_INVARIANCE');
    const srcAcc = tc.inputs.sourceAccount;
    const dstAcc = tc.inputs.destinationAccount;

    const input = {
      sourceAccountId: srcAcc.id,
      destinationAccountId: dstAcc.id,
      amountMinor: tc.inputs.transferAmountMinor,
      date: tc.inputs.date,
      description: tc.inputs.description,
    };

    const transferObj = buildTransferEntries(input, 'trsf_gold_1');
    const entries = [transferObj.sourceEntry, transferObj.destinationEntry];
    const pairVal = validateTransferPairs(entries);

    const srcDelta = entries[0].entryType === 'owedByAccount' ? entries[0].amountMinor : -entries[0].amountMinor;
    const dstDelta = entries[1].entryType === 'owedByAccount' ? entries[1].amountMinor : -entries[1].amountMinor;
    const systemDelta = srcDelta + dstDelta;

    const bSrcNew = calculateAccountBalance(srcAcc, [entries[0]]);
    const bDstNew = calculateAccountBalance(dstAcc, [entries[1]]);

    const ok =
      pairVal.isValid &&
      entries.length === 2 &&
      systemDelta === 0 &&
      bSrcNew === tc.expected.sourceNewBalanceMinor &&
      bDstNew === tc.expected.destinationNewBalanceMinor;

    assert(tc.id, 'Inter-account transfer balance invariance Delta = 0', ok,
      `Entries=${entries.length}, SystemDelta=${systemDelta}, SrcNew=${bSrcNew}, DstNew=${bDstNew}`);
  }

  // 7. GOLDEN_07_TRANSFER_REJECTIONS (Iterates dynamically over JSON fixture testCases)
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_07_TRANSFER_REJECTIONS');
    let allScenariosRejected = true;
    const scenarioDetails: string[] = [];

    for (const scenarioCase of tc.testCases) {
      const accounts: AccountModel[] = scenarioCase.accounts.map((a: any) => ({
        ...a,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }));

      const txs: TransactionModel[] = (scenarioCase.currentTransactions || []).map((t: any) => ({
        ...t,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }));

      const res = validateInterAccountTransfer(scenarioCase.input, accounts, txs);

      if (scenarioCase.shouldReject) {
        if (res.isValid) {
          allScenariosRejected = false;
          scenarioDetails.push(`${scenarioCase.scenario}: UNEXPECTED_PASS`);
        } else {
          scenarioDetails.push(`${scenarioCase.scenario}: REJECTED_OK`);
        }
      }
    }

    assert(tc.id, 'Transfer rejection rules enforcement (from JSON fixture)', allScenariosRejected,
      scenarioDetails.join(' | '));
  }

  // 8. GOLDEN_08_STATEMENT_PERIODS_AND_SAME_DAY_ORDERING
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_08_STATEMENT_PERIODS_AND_SAME_DAY_ORDERING');
    const acc: AccountModel = {
      ...tc.inputs.account,
      parentId: null,
      categoryId: 'cat_1',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };

    const txs: TransactionModel[] = tc.inputs.allTransactions.map((t: any) => ({
      ...t,
      description: 'حركة اختبارية',
      attachmentIds: [],
      updatedAt: t.createdAt,
    }));

    const stmt = calculateAccountStatement(acc, txs, tc.inputs.fromDate, tc.inputs.toDate);

    const ok =
      stmt.openingBalanceMinor === tc.expected.openingBalanceForPeriod &&
      stmt.closingBalanceMinor === tc.expected.closingBalanceForPeriod &&
      stmt.totalOwedByMinor === tc.expected.totalOwedByInPeriod &&
      stmt.totalOwedToMinor === tc.expected.totalOwedToInPeriod &&
      stmt.rows.length === 3 &&
      stmt.rows[0].runningBalanceMinor === tc.expected.orderedRowsInPeriod[0].runningBalance &&
      stmt.rows[1].runningBalanceMinor === tc.expected.orderedRowsInPeriod[1].runningBalance &&
      stmt.rows[2].runningBalanceMinor === tc.expected.orderedRowsInPeriod[2].runningBalance;

    assert(tc.id, 'Account statement period calculation & running balances', ok,
      `Opening=${stmt.openingBalanceMinor}, Closing=${stmt.closingBalanceMinor}, RowsCount=${stmt.rows.length}`);
  }

  // 9. GOLDEN_09_DUE_SETTLEMENT_LIFECYCLE_N2 (Full Atomic Lifecycle & Rollback on Failure)
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_09_DUE_SETTLEMENT_LIFECYCLE_N2');
    const testDbId = `gold_due_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isolatedStorage = createIsolatedTestStorage(testDbId);

    try {
      const acc: AccountModel = {
        id: tc.inputs.account.id,
        name: tc.inputs.account.name,
        parentId: null,
        categoryId: 'cat_gold_due',
        openingBalanceMinor: tc.inputs.account.openingBalanceMinor,
        status: tc.inputs.account.status,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      await isolatedStorage.put(STORES_REAL.ACCOUNTS, acc);

      // Phase 1: Create due record
      const initialDue: DueItemContract = {
        id: tc.inputs.initialDue.id,
        accountId: tc.inputs.initialDue.accountId,
        entryType: tc.inputs.initialDue.entryType,
        dueDate: tc.inputs.initialDue.dueDate,
        originalAmountMinor: tc.inputs.initialDue.originalAmountMinor,
        settledAmountMinor: 0,
        status: 'pending',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      await isolatedStorage.addDue(initialDue, false);

      const duesAfterCreation = await isolatedStorage.getAll<DueItemContract>(STORES_REAL.DUES);
      const txsAfterCreation = await isolatedStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const b0 = calculateAccountBalance(acc, txsAfterCreation);

      const creationVerified =
        duesAfterCreation.length === 1 &&
        txsAfterCreation.length === tc.expected.afterCreation.ledgerTransactionsCount &&
        b0 === tc.expected.afterCreation.accountBalanceMinor;

      // Phase 2: Execute legitimate Partial Payment atomically
      const txPartial: TransactionModel = {
        id: 'tx_pay_partial_1',
        accountId: acc.id,
        entryType: 'owedToAccount',
        amountMinor: tc.inputs.partialPaymentMinor,
        date: '2026-04-10',
        description: 'سداد جزئي معتمد',
        attachmentIds: [],
        createdAt: '2026-04-10T10:00:00Z',
        updatedAt: '2026-04-10T10:00:00Z',
      };
      const allocPartial: PaymentAllocationContract = {
        id: 'alloc_partial_1',
        dueItemId: initialDue.id,
        paymentTransactionId: txPartial.id,
        amountMinor: tc.inputs.partialPaymentMinor,
      };

      await isolatedStorage.recordDuePaymentAtomic(initialDue.id, txPartial, allocPartial, false);

      const duesAfterPartial = await isolatedStorage.getAll<DueItemContract>(STORES_REAL.DUES);
      const txsAfterPartial = await isolatedStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const allocsAfterPartial = await isolatedStorage.getAll<PaymentAllocationContract>(STORES_REAL.ALLOCATIONS);
      const bAfterPartial = calculateAccountBalance(acc, txsAfterPartial);

      const partialVerified =
        duesAfterPartial[0].settledAmountMinor === tc.expected.afterPartialPayment.dueSettledAmountMinor &&
        duesAfterPartial[0].status === tc.expected.afterPartialPayment.dueStatus &&
        txsAfterPartial.length === 1 &&
        allocsAfterPartial.length === 1 &&
        bAfterPartial === tc.expected.afterPartialPayment.newAccountBalanceMinor;

      // Phase 3: Attempt Overpayment and verify atomic rejection
      let overpaymentRejected = false;
      try {
        const txOverpay: TransactionModel = {
          id: 'tx_pay_overpay',
          accountId: acc.id,
          entryType: 'owedToAccount',
          amountMinor: tc.inputs.overpaymentMinor, // 40,000 exceeds 35,000 remaining!
          date: '2026-04-12',
          description: 'سداد زائد مرفوض',
          attachmentIds: [],
          createdAt: '2026-04-12T10:00:00Z',
          updatedAt: '2026-04-12T10:00:00Z',
        };
        const allocOverpay: PaymentAllocationContract = {
          id: 'alloc_overpay',
          dueItemId: initialDue.id,
          paymentTransactionId: txOverpay.id,
          amountMinor: tc.inputs.overpaymentMinor,
        };
        await isolatedStorage.recordDuePaymentAtomic(initialDue.id, txOverpay, allocOverpay, false);
      } catch {
        overpaymentRejected = true;
      }

      // Phase 4: Simulated failure injection (mismatched direction payment) & atomic rollback check
      let atomicRollbackVerified = false;
      try {
        const txMismatchedDirection: TransactionModel = {
          id: 'tx_pay_fail_dir',
          accountId: acc.id,
          entryType: 'owedByAccount', // WRONG DIRECTION: must be opposite of due!
          amountMinor: tc.inputs.atomicFailureSimulation.invalidDirectionPaymentMinor,
          date: '2026-04-13',
          description: 'سداد باتجاه خاطئ',
          attachmentIds: [],
          createdAt: '2026-04-13T10:00:00Z',
          updatedAt: '2026-04-13T10:00:00Z',
        };
        const allocMismatched: PaymentAllocationContract = {
          id: 'alloc_fail_dir',
          dueItemId: initialDue.id,
          paymentTransactionId: txMismatchedDirection.id,
          amountMinor: tc.inputs.atomicFailureSimulation.invalidDirectionPaymentMinor,
        };
        await isolatedStorage.recordDuePaymentAtomic(initialDue.id, txMismatchedDirection, allocMismatched, false);
      } catch {
        // Verify rollback: no new transactions or allocations were stored, due remained intact
        const txsAfterFailed = await isolatedStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
        const duesAfterFailed = await isolatedStorage.getAll<DueItemContract>(STORES_REAL.DUES);
        const allocsAfterFailed = await isolatedStorage.getAll<PaymentAllocationContract>(STORES_REAL.ALLOCATIONS);

        atomicRollbackVerified =
          txsAfterFailed.length === 1 &&
          allocsAfterFailed.length === 1 &&
          duesAfterFailed[0].settledAmountMinor === tc.expected.afterPartialPayment.dueSettledAmountMinor;
      }

      // Phase 5: Execute final remaining payment to settle due completely
      const txFinal: TransactionModel = {
        id: 'tx_pay_final_2',
        accountId: acc.id,
        entryType: 'owedToAccount',
        amountMinor: tc.inputs.finalPaymentMinor,
        date: '2026-04-15',
        description: 'سداد نهائي مكمل',
        attachmentIds: [],
        createdAt: '2026-04-15T10:00:00Z',
        updatedAt: '2026-04-15T10:00:00Z',
      };
      const allocFinal: PaymentAllocationContract = {
        id: 'alloc_final_2',
        dueItemId: initialDue.id,
        paymentTransactionId: txFinal.id,
        amountMinor: tc.inputs.finalPaymentMinor,
      };

      await isolatedStorage.recordDuePaymentAtomic(initialDue.id, txFinal, allocFinal, false);

      const duesAfterFinal = await isolatedStorage.getAll<DueItemContract>(STORES_REAL.DUES);
      const txsAfterFinal = await isolatedStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const bAfterFinal = calculateAccountBalance(acc, txsAfterFinal);

      const finalVerified =
        duesAfterFinal[0].settledAmountMinor === tc.expected.afterFinalPayment.dueSettledAmountMinor &&
        duesAfterFinal[0].status === tc.expected.afterFinalPayment.dueStatus &&
        txsAfterFinal.length === 2 &&
        bAfterFinal === tc.expected.afterFinalPayment.finalAccountBalanceMinor;

      const ok = creationVerified && partialVerified && overpaymentRejected && atomicRollbackVerified && finalVerified;

      assert(tc.id, 'N2 due creation non-interference & atomic partial settlement lifecycle', ok,
        `Created=${creationVerified}, Partial=${partialVerified}, OverpayRejected=${overpaymentRejected}, RollbackVerified=${atomicRollbackVerified}, FinalSettled=${finalVerified}`);
    } finally {
      await isolatedStorage.destroyDatabase();
    }
  }

  // 10. GOLDEN_10_BACKUP_INTEGRITY_AND_TAMPER_DETECTION (Authentic Corrupted Backup Rejection)
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_10_BACKUP_INTEGRITY_AND_TAMPER_DETECTION');
    const dataPayload = tc.inputs.dataPayload;
    const jsonStr = JSON.stringify(dataPayload);
    const validDigest = await computeSHA256(jsonStr);

    const validManifest = {
      formatName: 'RAKAN_BALANCE_BACKUP',
      backupFormatVersion: 2,
      schemaVersion: 2,
      exportedAt: '2026-11-07T00:00:00Z',
      appName: 'راكان بلانس | RAKAN BALANCE',
      checksum: validDigest,
      recordCounts: {
        accounts: 1,
        categories: 1,
        transactions: 0,
        attachments: 0,
        notes: 0,
        dues: 0,
        allocations: 0,
        reminders: 0,
      },
    };

    // 1. Verify that valid bundle is accepted
    const validBundleString = JSON.stringify({ manifest: validManifest, data: dataPayload });
    const validValidationResult = await validateBackupFile(validBundleString);

    // 2. Iterate through corrupted backup scenarios defined in JSON fixture
    let allCorruptionsRejected = true;
    const corruptionResults: string[] = [];

    for (const scenario of tc.corruptedBackupScenarios) {
      let corruptedString = '';

      if (scenario.tamperedPayload) {
        corruptedString = scenario.tamperedPayload;
      } else if (scenario.scenario === 'tampered_checksum') {
        const tamperedManifest = { ...validManifest, checksum: scenario.tamperModification.checksum };
        corruptedString = JSON.stringify({ manifest: tamperedManifest, data: dataPayload });
      } else if (scenario.scenario === 'record_counts_mismatch') {
        const tamperedManifest = {
          ...validManifest,
          recordCounts: { ...validManifest.recordCounts, accounts: scenario.tamperModification.recordCounts.accounts },
        };
        corruptedString = JSON.stringify({ manifest: tamperedManifest, data: dataPayload });
      } else if (scenario.scenario === 'unsupported_backup_format_version') {
        const tamperedManifest = {
          ...validManifest,
          backupFormatVersion: scenario.tamperModification.backupFormatVersion,
        };
        corruptedString = JSON.stringify({ manifest: tamperedManifest, data: dataPayload });
      }

      const res = await validateBackupFile(corruptedString);

      if (res.isValid) {
        allCorruptionsRejected = false;
        corruptionResults.push(`${scenario.scenario}: UNEXPECTED_ACCEPT`);
      } else {
        corruptionResults.push(`${scenario.scenario}: REJECTED_OK`);
      }
    }

    // 3. Test Actual Failed Restore Atomic Rollback on Isolated DB
    const testDbId = `gold_restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isolatedStorage = createIsolatedTestStorage(testDbId);
    let failedRestoreRollbackVerified = false;

    try {
      const canaryAccount: AccountModel = {
        id: 'acc_canary_restore_1',
        name: 'حساب كناري قبل الاستعادة',
        parentId: null,
        categoryId: 'cat_canary',
        openingBalanceMinor: 88800,
        status: 'active',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      await isolatedStorage.put(STORES_REAL.ACCOUNTS, canaryAccount);

      // Attempt atomic restore of a corrupted payload that deliberately throws
      try {
        const throwingBundleData: any = {
          accounts: [{ id: 'bad_acc', get name(): string { throw new Error('Simulated atomic restore corruption'); } }],
          categories: [],
          transactions: [],
          attachments: [],
          notes: [],
        };
        await isolatedStorage.atomicRestore(throwingBundleData);
      } catch {
        // Verify canary account was preserved by transaction rollback
        const accountsAfter = await isolatedStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS);
        failedRestoreRollbackVerified = accountsAfter.some((a) => a.id === 'acc_canary_restore_1');
      }
    } finally {
      await isolatedStorage.destroyDatabase();
    }

    const ok = validValidationResult.isValid && allCorruptionsRejected && failedRestoreRollbackVerified;

    assert(tc.id, 'Backup integrity: authentic corrupt backup rejection and atomic restore rollback', ok,
      `ValidAccepted=${validValidationResult.isValid}, Corruptions=${corruptionResults.join(' | ')}, RollbackPreserved=${failedRestoreRollbackVerified}`);
  }

  return { passedCount, failedCount, results };
}

// Direct execution when invoked via tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  runGoldenFixturesTests().then(({ passedCount, failedCount, results }) => {
    console.log('\n================================================================================');
    console.log('              RAKAN BALANCE — GOLDEN FIXTURES VERIFICATION RESULTS              ');
    console.log('================================================================================');
    for (const r of results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name}`);
      console.log(`       ${r.message}`);
    }
    console.log('--------------------------------------------------------------------------------');
    console.log(`TOTAL FIXTURES: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('================================================================================\n');
    if (failedCount > 0) {
      process.exit(1);
    }
  });
}
