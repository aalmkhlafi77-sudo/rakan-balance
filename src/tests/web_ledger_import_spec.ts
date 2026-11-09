/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Web Ledger Import Verification Suite
 * Tests for Stage WEB-F1: CSV and XLSX import validation, duplicate detection, boundary limits, and atomic IDB rollback.
 */

import {
  parseAndPreviewFile,
  previewFromRows,
  buildIssuesCsv,
  buildCommitReportCsv,
  buildAccountsCsvTemplate,
  buildTransactionsCsvTemplate,
  buildXlsxTemplate,
  isValidDateString,
} from '../domain/web_ledger_import.ts';
import { createIsolatedTestStorage, STORES_REAL } from '../storage/indexed_db.ts';
import { AccountModel, CategoryModel, TransactionModel } from '../domain/types.ts';

export async function runWebLedgerImportTestSuite(): Promise<{ passed: number; failed: number }> {
  console.log('='.repeat(80));
  console.log('   RAKAN BALANCE — WEB LEDGER IMPORT (WEB-F1) TEST SUITE   ');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`[PASS] ${testName}${detail ? ` - ${detail}` : ''}`);
    } else {
      failed++;
      console.error(`[FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    }
  }

  // 1. UTF-8 BOM CSV headers
  try {
    const csvStr = '\uFEFFexternalRef,name,category,openingBalance,phone,notes\nA-001,أحمد,أفراد,0.00,0500000000,';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(csvStr).buffer;
    const preview = await parseAndPreviewFile({
      buffer,
      fileName: 'accounts.csv',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      preview.blockingIssues.length === 0 && preview.accounts.length === 1 && preview.accounts[0].externalRef === 'A-001' && preview.canCommit,
      'Test 1: UTF-8 BOM CSV headers recognition',
      `Importable accounts: ${preview.importableAccounts}`
    );
  } catch (err: any) {
    assert(false, 'Test 1: UTF-8 BOM CSV headers recognition', err.message);
  }

  // 2. Generated XLSX template round-trip
  try {
    const bytes = await buildXlsxTemplate();
    const preview = await parseAndPreviewFile({
      buffer: bytes,
      fileName: 'rakan_import_template.xlsx',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      preview.blockingIssues.length === 0 && preview.accounts.length === 1 && preview.transactions.length === 1 && preview.canCommit,
      'Test 2: Generated XLSX template round-trip',
      `Accounts: ${preview.accounts.length}, Txs: ${preview.transactions.length}`
    );
  } catch (err: any) {
    assert(false, 'Test 2: Generated XLSX template round-trip', err.message);
  }

  // 3. Validation and Commit reports formatting
  try {
    const preview = previewFromRows({
      sourceName: 'input.csv',
      accountRows: [{ name: 'موجود', category: 'عام', openingbalance: '0' }],
      transactionRows: [],
      existingAccounts: [
        {
          id: 'acc1',
          name: 'موجود',
          parentId: null,
          categoryId: 'cat1',
          openingBalanceMinor: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      existingTransactions: [],
    });

    const issuesCsv = buildIssuesCsv(preview);
    const commitCsv = buildCommitReportCsv(preview, {
      importedAccounts: 0,
      skippedAccounts: 1,
      importedTransactions: 0,
      skippedTransactions: 0,
    });

    assert(
      issuesCsv.startsWith('\uFEFF') && issuesCsv.includes('مكرر') && commitCsv.includes('تم التنفيذ ذريًا'),
      'Test 3: Validation and Commit reports formatting',
      'UTF-8 BOM & Arabic text present'
    );
  } catch (err: any) {
    assert(false, 'Test 3: Validation and Commit reports formatting', err.message);
  }

  // 4. Mixed CSV row numbering preservation
  try {
    const csvStr =
      'recordType,externalRef,name,category,openingBalance,accountRef,entryType,amount,date,description\n' +
      'account,A-1,عميل,عام,0.00,,,,,\n' +
      'unknown,,,,,,,,,سجل غير معروف\n' +
      'transaction,,,,,A-1,لك,5.00,2026-11-07,فاتورة';
    const encoder = new TextEncoder();
    const preview = await parseAndPreviewFile({
      buffer: encoder.encode(csvStr).buffer,
      fileName: 'mixed.csv',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      preview.blockingIssues.length === 1 && preview.blockingIssues[0].rowNumber === 3,
      'Test 4: Mixed CSV row numbering preservation',
      `Row ${preview.blockingIssues[0]?.rowNumber} flagged`
    );
  } catch (err: any) {
    assert(false, 'Test 4: Mixed CSV row numbering preservation', err.message);
  }

  // 5. Duplicates detection against DB and batch
  try {
    const existingAccount: AccountModel = {
      id: 'existing1',
      name: 'موجود',
      parentId: null,
      categoryId: 'cat1',
      openingBalanceMinor: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const existingTx: TransactionModel = {
      id: 'tx1',
      accountId: 'existing1',
      entryType: 'owedToAccount',
      amountMinor: 200,
      date: '2026-11-07',
      description: 'دفعة',
      attachmentIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const preview = previewFromRows({
      sourceName: 'dups.csv',
      accountRows: [
        { externalref: 'A-1', name: 'جديد', category: 'عام', openingbalance: '10.25' },
        { externalref: 'OLD', name: 'موجود', category: 'عام', openingbalance: '0' },
      ],
      transactionRows: [
        { accountref: 'A-1', entrytype: 'لك', amount: '15.50', date: '2026-11-06', description: 'فاتورة' },
        { accountref: 'موجود', entrytype: 'عليك', amount: '2.00', date: '2026-11-07', description: 'دفعة' },
      ],
      existingAccounts: [existingAccount],
      existingTransactions: [existingTx],
    });

    assert(
      preview.blockingIssues.length === 0 &&
      preview.accounts[1].duplicate &&
      preview.transactions[1].duplicate &&
      preview.importableAccounts === 1 &&
      preview.importableTransactions === 1 &&
      preview.canCommit,
      'Test 5: Duplicates detection',
      'Duplicates flagged as non-blocking warnings'
    );
  } catch (err: any) {
    assert(false, 'Test 5: Duplicates detection', err.message);
  }

  // 6. Blocking issues for unknown account, missing direction, invalid date, negative amount
  try {
    const preview = previewFromRows({
      sourceName: 'bad.csv',
      accountRows: [],
      transactionRows: [
        { accountref: 'missing', entrytype: 'لك', amount: '10.00', date: '2026-11-07', description: 'حساب غير موجود' },
        { accountref: 'acc1', entrytype: 'اتجاه_باطل', amount: '10.00', date: '2026-11-07', description: 'اتجاه باطل' },
        { accountref: 'acc1', entrytype: 'لك', amount: '-25.00', date: '2026-11-07', description: 'مبلغ سالب' },
        { accountref: 'acc1', entrytype: 'لك', amount: '25.00', date: '2026-02-30', description: 'تاريخ غير صالح في فبراير' },
      ],
      existingAccounts: [
        {
          id: 'acc1',
          name: 'عميل 1',
          parentId: null,
          categoryId: 'cat1',
          openingBalanceMinor: 0,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.length >= 4,
      'Test 6: Blocking invalid inputs',
      `Blocking issues count: ${preview.blockingIssues.length}`
    );
  } catch (err: any) {
    assert(false, 'Test 6: Blocking invalid inputs', err.message);
  }

  // 7. Boundaries: 100 Billion SAR limit & >2 decimal fractions
  try {
    const preview = previewFromRows({
      sourceName: 'bounds.csv',
      accountRows: [
        { name: 'عميل الحدود', category: 'عام', openingbalance: '100000000000.01' },
        { name: 'عميل كسور باطلة', category: 'عام', openingbalance: '12.345' },
      ],
      transactionRows: [],
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.length === 2,
      'Test 7: Financial precision and boundary limits',
      `Rejections: ${preview.blockingIssues.length}`
    );
  } catch (err: any) {
    assert(false, 'Test 7: Financial precision and boundary limits', err.message);
  }

  // 8. Corrupted CSV file handling
  try {
    const encoder = new TextEncoder();
    const unclosedQuoteCsv = 'name,category\n"أحمد,عام';
    const preview = await parseAndPreviewFile({
      buffer: encoder.encode(unclosedQuoteCsv).buffer,
      fileName: 'unclosed.csv',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.length > 0 && preview.blockingIssues[0].message.includes('تنسيق CSV'),
      'Test 8: Corrupted CSV syntax rejection',
      `Message: ${preview.blockingIssues[0]?.message}`
    );
  } catch (err: any) {
    assert(false, 'Test 8: Corrupted CSV syntax rejection', err.message);
  }

  // 9. Corrupted XLSX file handling
  try {
    const corruptXlsx = new Uint8Array([0x50, 0x4B, 0x00, 0x00, 0x12, 0x34]);
    const preview = await parseAndPreviewFile({
      buffer: corruptXlsx.buffer,
      fileName: 'broken.xlsx',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.length > 0 && preview.blockingIssues[0].message.includes('Excel'),
      'Test 9: Corrupted XLSX binary rejection',
      `Message: ${preview.blockingIssues[0]?.message}`
    );
  } catch (err: any) {
    assert(false, 'Test 9: Corrupted XLSX binary rejection', err.message);
  }

  // 10. Unsupported file extension
  try {
    const preview = await parseAndPreviewFile({
      buffer: new ArrayBuffer(8),
      fileName: 'statement.pdf',
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.length > 0 && preview.blockingIssues[0].message.includes('غير مدعومة'),
      'Test 10: Unsupported file extension rejection',
      `Message: ${preview.blockingIssues[0]?.message}`
    );
  } catch (err: any) {
    assert(false, 'Test 10: Unsupported file extension rejection', err.message);
  }

  // 11. External reference conflict
  try {
    const preview = previewFromRows({
      sourceName: 'conflict.csv',
      accountRows: [
        { externalref: 'REF-1', name: 'حساب أ', category: 'عام', openingbalance: '0' },
        { externalref: 'REF-1', name: 'حساب ب', category: 'عام', openingbalance: '0' },
      ],
      transactionRows: [],
      existingAccounts: [],
      existingTransactions: [],
    });

    assert(
      !preview.canCommit && preview.blockingIssues.some((issue) => issue.message.includes('المرجع الخارجي')),
      'Test 11: Conflicting external reference rejection',
      'Conflicting ref blocked'
    );
  } catch (err: any) {
    assert(false, 'Test 11: Conflicting external reference rejection', err.message);
  }

  // 12. IndexedDB atomic import execution & precision
  try {
    const testStorage = createIsolatedTestStorage('WebImport_TestStorage_Atomic');
    const preview = previewFromRows({
      sourceName: 'valid.csv',
      accountRows: [{ externalref: 'A-1', name: 'عميل جديد', category: 'عملاء', openingbalance: '20.00' }],
      transactionRows: [{ accountref: 'A-1', entrytype: 'لك', amount: '125.50', date: '2026-11-07', description: 'فاتورة' }],
      existingAccounts: [],
      existingTransactions: [],
    });

    const result = await testStorage.importLedgerAtomic(preview, 'real');
    const dbAccounts = await testStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS);
    const dbTransactions = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);

    assert(
      result.importedAccounts === 1 &&
      result.importedTransactions === 1 &&
      dbAccounts.length === 1 &&
      dbAccounts[0].openingBalanceMinor === 2000 &&
      dbTransactions.length === 1 &&
      dbTransactions[0].amountMinor === 12550 &&
      dbTransactions[0].entryType === 'owedByAccount',
      'Test 12: Atomic import commit in IndexedDB with exact halalas',
      `Imported acc: ${dbAccounts[0]?.name}, tx halalas: ${dbTransactions[0]?.amountMinor}`
    );
    await testStorage.destroyDatabase();
  } catch (err: any) {
    assert(false, 'Test 12: Atomic import commit in IndexedDB with exact halalas', err.message);
  }

  console.log('-'.repeat(80));
  console.log(`WEB LEDGER IMPORT SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('='.repeat(80));

  return { passed, failed };
}
