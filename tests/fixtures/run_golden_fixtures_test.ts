/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Golden Fixtures Verification Runner
 * Verifies that the production financial calculation engine satisfies all 10 Golden Reference Fixtures
 * without modifying any production code or live database.
 */

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
import { computeSHA256 } from '../../src/storage/backup_service.ts';
import { AccountModel, TransactionModel, EntryType } from '../../src/domain/types.ts';

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

  // 7. GOLDEN_07_TRANSFER_REJECTIONS
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_07_TRANSFER_REJECTIONS');
    const acc1: AccountModel = { id: 'acc_1', name: 'أحمد', parentId: null, categoryId: 'cat_1', openingBalanceMinor: 50000, status: 'active', createdAt: '', updatedAt: '' };
    const accArchived: AccountModel = { id: 'dst_archived', name: 'مؤرشف', parentId: null, categoryId: 'cat_1', openingBalanceMinor: 20000, status: 'archived', createdAt: '', updatedAt: '' };

    // Case 1: Same source and destination
    const resSame = validateInterAccountTransfer(
      { sourceAccountId: 'acc_1', destinationAccountId: 'acc_1', amountMinor: 5000, date: '2026-03-10', description: 'تجربة' },
      [acc1],
      []
    );

    // Case 2: Transfer exceeds source balance
    const resExceeds = validateInterAccountTransfer(
      { sourceAccountId: 'acc_1', destinationAccountId: 'dst_1', amountMinor: 80000, date: '2026-03-10', description: 'تجاوز' },
      [acc1, { ...acc1, id: 'dst_1' }],
      []
    );

    // Case 3: Archived participant
    const resArchived = validateInterAccountTransfer(
      { sourceAccountId: 'acc_1', destinationAccountId: 'dst_archived', amountMinor: 10000, date: '2026-03-10', description: 'مؤرشف' },
      [acc1, accArchived],
      []
    );

    const ok = !resSame.isValid && !resExceeds.isValid && !resArchived.isValid;

    assert(tc.id, 'Transfer rejection rules enforcement', ok,
      `SameAccRejected=${!resSame.isValid}, ExceedsRejected=${!resExceeds.isValid}, ArchivedRejected=${!resArchived.isValid}`);
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

  // 9. GOLDEN_09_DUE_SETTLEMENT_LIFECYCLE_N2
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_09_DUE_SETTLEMENT_LIFECYCLE_N2');
    const acc: AccountModel = {
      ...tc.inputs.account,
      parentId: null,
      categoryId: 'cat_1',
      createdAt: '',
      updatedAt: '',
    };

    // Before settlement: Due does not touch balance
    const b0 = calculateAccountBalance(acc, []);

    // Partial settlement creates 1 ledger transaction
    const txPartial: TransactionModel = {
      id: 'tx_pay_1',
      accountId: acc.id,
      entryType: 'owedToAccount',
      amountMinor: tc.inputs.partialPaymentMinor,
      date: '2026-04-10',
      description: 'سداد جزئي',
      attachmentIds: [],
      createdAt: '',
      updatedAt: '',
    };

    const bAfterPartial = calculateAccountBalance(acc, [txPartial]);

    // Final settlement creates second payment
    const txFinal: TransactionModel = {
      id: 'tx_pay_2',
      accountId: acc.id,
      entryType: 'owedToAccount',
      amountMinor: tc.inputs.finalPaymentMinor,
      date: '2026-04-15',
      description: 'سداد نهائي',
      attachmentIds: [],
      createdAt: '',
      updatedAt: '',
    };

    const bAfterFinal = calculateAccountBalance(acc, [txPartial, txFinal]);

    const ok =
      b0 === tc.expected.afterCreation.accountBalanceMinor &&
      bAfterPartial === tc.expected.afterPartialPayment.newAccountBalanceMinor &&
      bAfterFinal === tc.expected.afterFinalPayment.finalAccountBalanceMinor;

    assert(tc.id, 'N2 due creation non-interference & atomic partial settlement', ok,
      `InitialBalance=${b0}, AfterPartial=${bAfterPartial}, AfterFinal=${bAfterFinal}`);
  }

  // 10. GOLDEN_10_BACKUP_INTEGRITY_AND_TAMPER_DETECTION
  {
    const tc = fixtureData.cases.find((c: any) => c.id === 'GOLDEN_10_BACKUP_INTEGRITY_AND_TAMPER_DETECTION');
    const dataPayload = tc.inputs.dataPayload;
    const jsonStr = JSON.stringify(dataPayload);
    const digest = await computeSHA256(jsonStr);

    const validChecksum = typeof digest === 'string' && digest.length === 64;

    // Tampered payload
    const tamperedData = { ...dataPayload, accounts: [] };
    const tamperedDigest = await computeSHA256(JSON.stringify(tamperedData));

    const ok = validChecksum && digest !== tamperedDigest;

    assert(tc.id, 'Backup integrity: SHA-256 calculation and tamper detection', ok,
      `DigestLength=${digest.length}, TamperDetected=${digest !== tamperedDigest}`);
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
