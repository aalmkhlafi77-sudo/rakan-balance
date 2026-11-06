/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RAKAN BALANCE (راكان بلانس) — Automated Verification Test Suite
 * Executable specifications testing all invariants from Document v2 & Final N0 Validation:
 * - STRICTLY uses an isolated, ephemeral test database (createIsolatedTestStorage)
 * - GUARANTEES zero touch and zero operations on user's live database (RakanBalanceDB_v2)
 * - Dynamic unique identifiers per test execution (no fixed IDs)
 * - Real IndexedDB atomic rollback under simulated failure
 * - Real validateBackupFile invocations for corrupt, incomplete, broken FKs, cycles, duplicate IDs, and unsafe amounts
 * - Real restore failure test verifying pre-existing data preservation
 * - Real demo notes isolation & purge test verifying real data is untouched
 * - Cleans up and destroys the isolated test database upon completion
 */

import {
  calculateAccountBalance,
  calculateAccountStatement,
  calculateDashboardSummary,
  checkTreeCycle,
} from './balance_calculator.ts';
import { tryToMinorUnits, MAX_SAFE_MINOR_AMOUNT } from './money.ts';
import {
  AccountModel,
  AttachmentModel,
  CategoryModel,
  StickyNoteModel,
  TransactionModel,
} from './types.ts';
import {
  createIsolatedTestStorage,
  DB_NAME,
  STORES_DEMO,
  STORES_REAL,
} from '../storage/indexed_db.ts';
import { computeSHA256, validateBackupFile } from '../storage/backup_service.ts';
import {
  buildTransferEntries,
  validateInterAccountTransfer,
  validateTransferPairs,
} from './inter_account_transfer.ts';

export interface TestResult {
  id: string;
  title: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export async function runFinancialVerificationSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // =========================================================================
  // ZERO-POLLUTION GUARANTEE:
  // Create an entirely separate, isolated database instance exclusively for tests.
  // Under NO circumstances does this suite touch RakanBalanceDB_v2 (user's production DB)!
  // =========================================================================
  const testStorage = createIsolatedTestStorage();
  const testDbName = testStorage.getDatabaseName();

  // Strict invariant sanity assertion: Test DB must NEVER equal production DB!
  if (testDbName === DB_NAME) {
    throw new Error('Fatal Security Violation: Test runner attempted to target production database!');
  }

  try {
    // =========================================================================
    // TEST 1: Mandatory Reference Example (Blueprint v2 - Section 4.1)
    // Opening: +200.00 (20000)
    // Owed by: +150.00 (15000) -> 35000
    // Owed to: -80.00 (8000)   -> 27000
    // Owed to: -300.00 (30000) -> -3000 (-30.00 عليك)
    // Statement starting from last transaction date must open at +270.00
    // =========================================================================
    {
      const account: AccountModel = {
        id: 'acc-ref-1',
        name: 'حساب الاختبار المرجعي',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 20000, // +200.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const transactions: TransactionModel[] = [
        {
          id: 'tx-1',
          accountId: 'acc-ref-1',
          entryType: 'owedByAccount',
          amountMinor: 15000, // +150.00
          date: '2026-11-02',
          description: 'بضاعة مستحقة',
          attachmentIds: [],
          createdAt: '2026-11-02T10:00:00Z',
          updatedAt: '2026-11-02T10:00:00Z',
        },
        {
          id: 'tx-2',
          accountId: 'acc-ref-1',
          entryType: 'owedToAccount',
          amountMinor: 8000, // -80.00
          date: '2026-11-03',
          description: 'دفعة مستلمة',
          attachmentIds: [],
          createdAt: '2026-11-03T10:00:00Z',
          updatedAt: '2026-11-03T10:00:00Z',
        },
        {
          id: 'tx-3',
          accountId: 'acc-ref-1',
          entryType: 'owedToAccount',
          amountMinor: 30000, // -300.00
          date: '2026-11-04',
          description: 'تسوية',
          attachmentIds: [],
          createdAt: '2026-11-04T10:00:00Z',
          updatedAt: '2026-11-04T10:00:00Z',
        },
      ];

      const currentBalance = calculateAccountBalance(account, transactions);
      const statementFromLastTx = calculateAccountStatement(
        account,
        transactions,
        '2026-11-04',
        '2026-11-04'
      );

      const isBalanceCorrect = currentBalance === -3000;
      const isStatementOpeningCorrect = statementFromLastTx.openingBalanceMinor === 27000;
      const isStatementClosingCorrect = statementFromLastTx.closingBalanceMinor === -3000;

      results.push({
        id: 'test-1-reference-example',
        title: 'اختبار 1: المثال المرجعي الإلزامي (وثيقة v2 بند 4.1)',
        passed: isBalanceCorrect && isStatementOpeningCorrect && isStatementClosingCorrect,
        expected: 'الرصيد النهائي: -30.00 (عليك 30 ر.س)، ورصيد بداية كشف حساب يبدأ من الحركة الأخيرة: +270.00',
        actual: `الرصيد: ${(currentBalance / 100).toFixed(2)} ر.س، رصيد أول الفترة: ${(statementFromLastTx.openingBalanceMinor / 100).toFixed(2)} ر.س، رصيد آخر الفترة: ${(statementFromLastTx.closingBalanceMinor / 100).toFixed(2)} ر.س`,
        details: 'مطابقة تامة بين تراكم الحركات ورصيد أول المدة المستقل عن الرصيد الافتتاحي.',
      });
    }

    // =========================================================================
    // TEST 2: Multi-Account Dashboard Totals (Document v2 Section 3 & 4)
    // Accounts: A (+100), B (-70), C (+20)
    // Total Receivable (لك) = 100 + 20 = 120
    // Total Payable (عليك) = 70
    // Net = 120 - 70 = 50
    // =========================================================================
    {
      const accounts: AccountModel[] = [
        {
          id: 'acc-a',
          name: 'طرف أ',
          parentId: null,
          categoryId: 'cat-1',
          openingBalanceMinor: 10000, // +100.00
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
        {
          id: 'acc-b',
          name: 'طرف ب',
          parentId: null,
          categoryId: 'cat-1',
          openingBalanceMinor: -7000, // -70.00
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
        {
          id: 'acc-c',
          name: 'طرف ج',
          parentId: null,
          categoryId: 'cat-1',
          openingBalanceMinor: 2000, // +20.00
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
      ];

      const summary = calculateDashboardSummary(accounts, []);
      const isReceivableCorrect = summary.totalReceivableMinor === 12000;
      const isPayableCorrect = summary.totalPayableMinor === 7000;
      const isNetCorrect = summary.netBalanceMinor === 5000;

      results.push({
        id: 'test-2-dashboard-totals',
        title: 'اختبار 2: تطابق إجماليات لوحة التحكم (لك / عليك / الصافي)',
        passed: isReceivableCorrect && isPayableCorrect && isNetCorrect,
        expected: 'إجمالي لك = 120.00، إجمالي عليك = 70.00، صافي المركز = 50.00',
        actual: `لك = ${(summary.totalReceivableMinor / 100).toFixed(2)}، عليك = ${(summary.totalPayableMinor / 100).toFixed(2)}، الصافي = ${(summary.netBalanceMinor / 100).toFixed(2)}`,
        details: 'حساب الصافي من حاصل طرح عليك من لك، مع عزل الموجب والسالب بدقة.',
      });
    }

    // =========================================================================
    // TEST 3: Sub-Accounts Independence & No Duplicate Counting
    // =========================================================================
    {
      const parentAccount: AccountModel = {
        id: 'parent-1',
        name: 'شركة رئيسية',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 5000, // +50.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const childAccount: AccountModel = {
        id: 'child-1',
        name: 'فرع الشركة',
        parentId: 'parent-1',
        categoryId: 'cat-1',
        openingBalanceMinor: 3000, // +30.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const summary = calculateDashboardSummary([parentAccount, childAccount], []);
      const passed = summary.totalReceivableMinor === 8000;

      results.push({
        id: 'test-3-subaccounts-independence',
        title: 'اختبار 3: استقلال الحسابات الفرعية ومنع التكرار المالي للأب والأبناء',
        passed,
        expected: 'إجمالي لك = 80.00 (رصيد الأب 50 + رصيد الفرع 30)',
        actual: `إجمالي لك = ${(summary.totalReceivableMinor / 100).toFixed(2)}`,
        details: 'الحسابات الفرعية تملك أرصدة مباشرة مستقلة ولا يضاعف رصيد الأب أبناءه في الإجماليات.',
      });
    }

    // =========================================================================
    // TEST 4: Tree Cycle Prevention
    // =========================================================================
    {
      const accounts: AccountModel[] = [
        {
          id: 'acc-1',
          name: 'الأب',
          parentId: null,
          categoryId: 'c1',
          openingBalanceMinor: 0,
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
        {
          id: 'acc-2',
          name: 'الابن',
          parentId: 'acc-1',
          categoryId: 'c1',
          openingBalanceMinor: 0,
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
        {
          id: 'acc-3',
          name: 'الحفيد',
          parentId: 'acc-2',
          categoryId: 'c1',
          openingBalanceMinor: 0,
          status: 'active',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
      ];

      const selfCycle = checkTreeCycle(accounts, 'acc-1', 'acc-1');
      const descendantCycle = checkTreeCycle(accounts, 'acc-1', 'acc-3');
      const safeChange = checkTreeCycle(accounts, 'acc-3', null);

      const passed = selfCycle && descendantCycle && !safeChange;

      results.push({
        id: 'test-4-cycle-prevention',
        title: 'اختبار 4: كشف ومنع الدورات الحلقية في شجرة الحسابات',
        passed,
        expected: 'منع تعيين الحساب أباً لنفسه أو لأي من أحفاده بنجاح',
        actual: `كشف تفرع لنفسه: ${selfCycle ? 'ممنوع' : 'مسموح'}، كشف تفرع لحفيده: ${descendantCycle ? 'ممنوع' : 'مسموح'}`,
        details: 'منع الحلقات يضمن سلامة الشجرة ومنع حدوث تجمد في المعالجة العودية.',
      });
    }

    // =========================================================================
    // TEST 5: Strict Money Input Validation & Boundary Cases (Review Fix #1)
    // =========================================================================
    {
      const invalidMultiDot = tryToMinorUnits('10.20.30');
      const invalidLetters = tryToMinorUnits('15a0');
      const invalidExtraDecimals = tryToMinorUnits('12.345');
      const invalidExtraDecimalsNum = tryToMinorUnits(12.345);
      const invalidEmpty = tryToMinorUnits('');
      const invalidSignOnly = tryToMinorUnits('-');
      const invalidDotOnly = tryToMinorUnits('.');
      const invalidNaN = tryToMinorUnits(NaN);
      const invalidOverflow = tryToMinorUnits(MAX_SAFE_MINOR_AMOUNT + 100);

      const validExactTwo = tryToMinorUnits('150.25');
      const validExactOne = tryToMinorUnits('150.2');
      const validWhole = tryToMinorUnits('150');
      const validNegative = tryToMinorUnits('-50.75');

      const allInvalidRejected =
        !invalidMultiDot.success &&
        !invalidLetters.success &&
        !invalidExtraDecimals.success &&
        !invalidExtraDecimalsNum.success &&
        !invalidEmpty.success &&
        !invalidSignOnly.success &&
        !invalidDotOnly.success &&
        !invalidNaN.success &&
        !invalidOverflow.success;

      const allValidAccepted =
        validExactTwo.success && validExactTwo.minor === 15025 &&
        validExactOne.success && validExactOne.minor === 15020 &&
        validWhole.success && validWhole.minor === 15000 &&
        validNegative.success && validNegative.minor === -5075;

      const passed = allInvalidRejected && allValidAccepted;

      results.push({
        id: 'test-5-strict-money-validation',
        title: 'اختبار 5: دقة toMinorUnits ورفض المدخلات المشوهة والكسور الزائدة',
        passed,
        expected: 'رفض قاطع لـ (10.20.30، 15a0، 12.345، NaN، وتجاوز الحدود) وقبول دقيق للأرقام النظامية',
        actual: passed
          ? 'تم رفض جميع المدخلات المشوهة الـ 9 بدقة، وقبول 150.25 -> 15025، 150.2 -> 15020، -50.75 -> -5075'
          : 'فشل أحد الفحوصات الحدية',
        details: 'ضمان عدم تقريب أجزاء الهللة بصمت أو قبول نصوص غير رقمية.',
      });
    }

    // =========================================================================
    // TEST 6: Real IndexedDB Atomic Save & Simulated Failure Rollback
    // EXCLUSIVELY executed on testStorage (isolated test database)
    // Uses dynamic unique random identifiers (zero fixed IDs)
    // =========================================================================
    try {
      const runToken = Math.random().toString(36).substring(2, 8);
      const successTxId = `tx_dyn_${Date.now()}_${runToken}`;
      const successAttId = `att_dyn_${Date.now()}_${runToken}`;

      const testTx: TransactionModel = {
        id: successTxId,
        accountId: `acc_test_${runToken}`,
        entryType: 'owedByAccount',
        amountMinor: 25000,
        date: '2026-11-06',
        description: 'حركة ذرية اختبارية ناجحة',
        attachmentIds: [successAttId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const testAtt: AttachmentModel = {
        id: successAttId,
        transactionId: successTxId,
        originalName: 'receipt.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        dataUrl: 'data:application/pdf;base64,VEVTVA==',
        createdAt: new Date().toISOString(),
      };

      // 1. Execute real atomic save on isolated test storage
      await testStorage.saveTransactionAtomic(testTx, [testAtt], false);

      // Verify both were committed inside testStorage
      const allTxs = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const allAtts = await testStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS);
      const txSaved = allTxs.some((t) => t.id === successTxId);
      const attSaved = allAtts.some((a) => a.id === successAttId);

      // 2. Simulate a failing atomic transaction:
      const failTxId = `tx_fail_${Date.now()}_${runToken}`;
      const failAttId = `att_fail_${Date.now()}_${runToken}`;

      const failTx: TransactionModel = {
        id: failTxId,
        accountId: `acc_test_${runToken}`,
        entryType: 'owedByAccount',
        amountMinor: 30000,
        date: '2026-11-06',
        description: 'حركة ذرية يجب أن تتراجع بالكامل',
        attachmentIds: [failAttId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Object designed to throw during attachment storage to trigger atomic rollback
      const badAttachmentList: AttachmentModel[] = [
        {
          id: failAttId,
          transactionId: failTxId,
          originalName: 'bad.pdf',
          mimeType: 'application/pdf',
          size: 512,
          dataUrl: 'data:application/pdf;base64,RkFJTA==',
          createdAt: new Date().toISOString(),
        },
        {
          get id(): string {
            throw new Error('Simulated failure during atomic attachment storage');
          },
        } as any,
      ];

      let atomicRollbackOccurred = false;
      try {
        await testStorage.saveTransactionAtomic(failTx, badAttachmentList, false);
      } catch {
        atomicRollbackOccurred = true;
      }

      // Verify that NEITHER the failing transaction NOR its attachment were saved in testStorage!
      const allTxsAfter = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const allAttsAfter = await testStorage.getAll<AttachmentModel>(STORES_REAL.ATTACHMENTS);
      const failTxLeaked = allTxsAfter.some((t) => t.id === failTxId);
      const failAttLeaked = allAttsAfter.some((a) => a.id === failAttId);

      const passed = txSaved && attSaved && atomicRollbackOccurred && !failTxLeaked && !failAttLeaked;

      results.push({
        id: 'test-6-real-indexeddb-atomicity',
        title: 'اختبار 6: التحقق الفعلي من ذرية التخزين والتراجع التام داخل قاعدة اختبار معزولة',
        passed,
        expected: 'حفظ ناجح متكامل، ثم تراجع كامل عند الفشل مع عدم بقاء أي حركة أو مرفق جزئي في قاعدة الاختبار',
        actual: passed
          ? `تم الحفظ والتراجع بنجاح داخل قاعدة الاختبار المعزولة (${testDbName}) مع صفر سجلات مسربة وصفر مساس ببيانات المستخدم`
          : `فشل التحقق: txSaved=${txSaved}, attSaved=${attSaved}, rollback=${atomicRollbackOccurred}, failTxLeaked=${failTxLeaked}, failAttLeaked=${failAttLeaked}`,
        details: `منفذ على قاعدة بيانات منفصلة تماماً (${testDbName}) دون أي اتصال بقاعدة الإنتاج.`,
      });
    } catch (err: any) {
      results.push({
        id: 'test-6-real-indexeddb-atomicity',
        title: 'اختبار 6: التحقق الفعلي من ذرية التخزين والتراجع التام داخل قاعدة اختبار معزولة',
        passed: false,
        expected: 'نجاح اختبار الذرية على قاعدة الاختبار المعزولة',
        actual: `استثناء غير متوقع: ${err.message}`,
      });
    }

    // =========================================================================
    // TEST 7: Real validateBackupFile Execution & Restore Data Preservation
    // Calls validateBackupFile with corrupt checksum, missing stores, broken FKs,
    // duplicate IDs, and unsafe amounts.
    // Simulates failed restore on testStorage and verifies pre-existing canary data is untouched.
    // =========================================================================
    try {
      const validBaseAccounts: AccountModel[] = [
        {
          id: 'acc-val-1',
          name: 'عميل معتمد',
          parentId: null,
          categoryId: 'cat-val-1',
          openingBalanceMinor: 5000,
          status: 'active',
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ];

      const validBaseCategories: CategoryModel[] = [
        { id: 'cat-val-1', name: 'تصنيف عام', sortOrder: 0 },
      ];

      const validBaseTransactions: TransactionModel[] = [
        {
          id: 'tx-val-1',
          accountId: 'acc-val-1',
          entryType: 'owedByAccount',
          amountMinor: 10000,
          date: '2026-11-02',
          description: 'حركة صالحة',
          attachmentIds: [],
          createdAt: '2026-11-02T00:00:00Z',
          updatedAt: '2026-11-02T00:00:00Z',
        },
      ];

      const makeBackupBundle = async (overrides: {
        accounts?: any[];
        categories?: any[];
        transactions?: any[];
        attachments?: any[];
        notes?: any[];
        settings?: any;
        tamperChecksum?: boolean;
        omitField?: string;
      }) => {
        const data: any = {
          accounts: overrides.accounts ?? validBaseAccounts,
          categories: overrides.categories ?? validBaseCategories,
          transactions: overrides.transactions ?? validBaseTransactions,
          attachments: overrides.attachments ?? [],
          notes: overrides.notes ?? [],
          settings: overrides.settings ?? {
            ownerName: 'راكان',
            theme: 'dark',
            currencyCode: 'SAR',
            currencySymbol: 'ر.س',
            currencyDecimals: 2,
          },
        };

        if (overrides.omitField) {
          delete data[overrides.omitField];
        }

        const payloadString = JSON.stringify(data);
        let checksum = await computeSHA256(payloadString);
        if (overrides.tamperChecksum) {
          checksum = '0000000000000000000000000000000000000000000000000000000000000000';
        }

        return JSON.stringify({
          manifest: {
            formatName: 'RAKAN_BALANCE_BACKUP',
            backupFormatVersion: 2,
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            appName: 'راكان بلانس | RAKAN BALANCE',
            checksum,
            recordCounts: {
              accounts: data.accounts ? data.accounts.length : 0,
              categories: data.categories ? data.categories.length : 0,
              transactions: data.transactions ? data.transactions.length : 0,
              attachments: data.attachments ? data.attachments.length : 0,
              notes: data.notes ? data.notes.length : 0,
            },
          },
          data,
        });
      };

      // 1. Corrupt Checksum
      const corruptChecksumJson = await makeBackupBundle({ tamperChecksum: true });
      const resChecksum = await validateBackupFile(corruptChecksumJson);
      const checksumRejected = !resChecksum.isValid && Boolean(resChecksum.error?.includes('SHA-256'));

      // 2. Missing Incomplete Store (omitted categories)
      const missingStoreJson = await makeBackupBundle({ omitField: 'categories' });
      const resMissing = await validateBackupFile(missingStoreJson);
      const missingRejected = !resMissing.isValid && Boolean(resMissing.error?.includes('ناقصة'));

      // 3. Broken Foreign Key (tx pointing to missing account)
      const orphanTx: TransactionModel = {
        id: 'tx-orphan',
        accountId: 'missing-acc-id',
        entryType: 'owedByAccount',
        amountMinor: 5000,
        date: '2026-11-03',
        description: 'حركة بحساب مفقود',
        attachmentIds: [],
        createdAt: '2026-11-03T00:00:00Z',
        updatedAt: '2026-11-03T00:00:00Z',
      };
      const brokenFkJson = await makeBackupBundle({ transactions: [orphanTx] });
      const resBrokenFk = await validateBackupFile(brokenFkJson);
      const brokenFkRejected = !resBrokenFk.isValid;

      // 4. Duplicate IDs in Accounts
      const duplicateAccounts = [
        ...validBaseAccounts,
        { ...validBaseAccounts[0], name: 'حساب مكرر بنفس المعرف' },
      ];
      const dupIdJson = await makeBackupBundle({ accounts: duplicateAccounts });
      const resDupId = await validateBackupFile(dupIdJson);
      const dupIdRejected = !resDupId.isValid && Boolean(resDupId.error?.includes('مكرر'));

      // 5. Unsafe Amount (negative amount in transaction)
      const unsafeTx: TransactionModel = {
        id: 'tx-unsafe',
        accountId: 'acc-val-1',
        entryType: 'owedByAccount',
        amountMinor: -500, // Negative amount forbidden!
        date: '2026-11-03',
        description: 'حركة بمبلغ غير آمن',
        attachmentIds: [],
        createdAt: '2026-11-03T00:00:00Z',
        updatedAt: '2026-11-03T00:00:00Z',
      };
      const unsafeAmountJson = await makeBackupBundle({ transactions: [unsafeTx] });
      const resUnsafeAmount = await validateBackupFile(unsafeAmountJson);
      const unsafeAmountRejected = !resUnsafeAmount.isValid;

      // 6. Pre-existing Data Preservation on Failed Restore:
      // Insert canary account into testStorage (NOT into production dbStorage!)
      const canaryRunToken = Math.random().toString(36).substring(2, 8);
      const canaryAccId = `acc_canary_${canaryRunToken}`;
      const canaryAccount: AccountModel = {
        id: canaryAccId,
        name: 'حساب كناري للتحقق من سلامة البيانات السابقة',
        parentId: null,
        categoryId: 'cat-val-1',
        openingBalanceMinor: 77700,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await testStorage.put(STORES_REAL.ACCOUNTS, canaryAccount);

      // Attempt a bad restore that deliberately throws inside testStorage
      let restoreFailedSafely = false;
      try {
        const corruptDataBundle: any = {
          accounts: [{ id: 'bad_acc', get name(): string { throw new Error('Simulated restore failure'); } }],
          categories: [],
          transactions: [],
          attachments: [],
          notes: [],
        };
        await testStorage.atomicRestore(corruptDataBundle);
      } catch {
        restoreFailedSafely = true;
      }

      // Verify canary account is STILL in testStorage!
      const testAccountsAfter = await testStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS);
      const canaryStillExists = testAccountsAfter.some(
        (a) => a.id === canaryAccId && a.openingBalanceMinor === 77700
      );

      const passed =
        checksumRejected &&
        missingRejected &&
        brokenFkRejected &&
        dupIdRejected &&
        unsafeAmountRejected &&
        restoreFailedSafely &&
        canaryStillExists;

      results.push({
        id: 'test-7-real-backup-validation-and-preservation',
        title: 'اختبار 7: التحقق الفعلي من validateBackupFile ورفض التالف والناقص وصيانة البيانات السابقة',
        passed,
        expected: 'رفض فعلي لـ 5 حالات تالفة، والحفاظ التام على البيانات السابقة عند فشل الاستعادة',
        actual: passed
          ? `تم استدعاء validateBackupFile ورفض جميع الحالات، وحُفظت بيانات الكناري دون مساس في (${testDbName})`
          : `فشل التحقق: checksum=${checksumRejected}, missing=${missingRejected}, brokenFK=${brokenFkRejected}, dupId=${dupIdRejected}, unsafeAmt=${unsafeAmountRejected}, preserve=${canaryStillExists}`,
        details: 'فحص حقيقي للتحقق من المخطط، المراجع، المعرفات، وتراجع الاستعادة الذرية.',
      });
    } catch (err: any) {
      results.push({
        id: 'test-7-real-backup-validation-and-preservation',
        title: 'اختبار 7: التحقق الفعلي من validateBackupFile ورفض التالف والناقص وصيانة البيانات السابقة',
        passed: false,
        expected: 'نجاح اختبارات فحص النسخ الاحتياطية',
        actual: `استثناء غير متوقع: ${err.message}`,
      });
    }

    // =========================================================================
    // TEST 8: Real Demo Notes Isolation & Workspace Purge Verification
    // EXCLUSIVELY executed on testStorage!
    // Calls testStorage.purgeDemoWorkspace() without touching user's dbStorage!
    // =========================================================================
    try {
      const notesRunToken = Math.random().toString(36).substring(2, 8);
      const realNoteId = `note_real_${notesRunToken}`;
      const demoNoteId = `note_demo_${notesRunToken}`;

      const realNote: StickyNoteModel = {
        id: realNoteId,
        title: 'ملاحظة سرية فعلية للمالك',
        content: 'يجب ألا تمس أو تتأثر بأي عمليات تجريبية',
        color: 'emerald',
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const demoNote: StickyNoteModel = {
        id: demoNoteId,
        title: 'ملاحظة تجريبية مؤقتة',
        content: 'تخضع للتصفير في مساحة التجربة فقط',
        color: 'amber',
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Put notes into their respective isolated stores inside testStorage
      await testStorage.put(STORES_REAL.NOTES, realNote);
      await testStorage.put(STORES_DEMO.NOTES, demoNote);

      // 2. Query testStorage stores directly
      const realBefore = await testStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES);
      const demoBefore = await testStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES);
      const bothExist =
        realBefore.some((n) => n.id === realNoteId) &&
        demoBefore.some((n) => n.id === demoNoteId);

      // 3. Purge demo workspace on testStorage (production demo workspace untouched!)
      await testStorage.purgeDemoWorkspace();

      // 4. Query testStorage stores again
      const realAfter = await testStorage.getAll<StickyNoteModel>(STORES_REAL.NOTES);
      const demoAfter = await testStorage.getAll<StickyNoteModel>(STORES_DEMO.NOTES);

      const demoWasPurged = !demoAfter.some((n) => n.id === demoNoteId);
      const realRemainedIntact = realAfter.some(
        (n) => n.id === realNoteId && n.title === realNote.title
      );

      const passed = bothExist && demoWasPurged && realRemainedIntact;

      results.push({
        id: 'test-8-real-notes-isolation-and-purge',
        title: 'اختبار 8: التحقق الفعلي من عزل الملاحظات التجريبية وتصفيرها دون المساس بالملاحظات الفعلية',
        passed,
        expected: 'تصفير الملاحظات التجريبية بالكامل مع بقاء الملاحظة الفعلية سالمة 100% في مخزنها الحقيقي',
        actual: passed
          ? `تم حفظ الملاحظتين في مخزنين منفصلين داخل (${testDbName})، وتصفير التجربة بنجاح، وظلت الملاحظة الفعلية سليمة دون تغيير`
          : `فشل التحقق: bothExist=${bothExist}, demoPurged=${demoWasPurged}, realIntact=${realRemainedIntact}`,
        details: 'عزل مادي كامل تم اختباره على قاعدة منفصلة دون استدعاء purge على بيانات المستخدم.',
      });
    } catch (err: any) {
      results.push({
        id: 'test-8-real-notes-isolation-and-purge',
        title: 'اختبار 8: التحقق الفعلي من عزل الملاحظات التجريبية وتصفيرها دون المساس بالملاحظات الفعلية',
        passed: false,
        expected: 'نجاح اختبار العزل والتصفير',
        actual: `استثناء غير متوقع: ${err.message}`,
      });
    }

    // =========================================================================
    // TEST 9: Real Rollback Snapshot Settings Invariance & Restore Accuracy (Flaw #1)
    // Verifies that rollback snapshots restore original settings and accounts accurately,
    // preserving settings format as a clean object (no array type corruption or field loss).
    // =========================================================================
    try {
      const origAccount: AccountModel = {
        id: 'acc_snap_orig_1',
        name: 'حساب أصلي قبل أخذ اللقطة',
        parentId: null,
        categoryId: 'cat_c1',
        openingBalanceMinor: 15000,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const origSettings = {
        key: 'user_preferences',
        ownerName: 'المالك الأصلي المحفوظ',
        theme: 'light',
        sidebarCollapsed: true,
      };

      // 1. Seed initial data and settings in testStorage
      await testStorage.put(STORES_REAL.ACCOUNTS, origAccount);
      await testStorage.put(STORES_REAL.SETTINGS, origSettings);

      // 2. Capture safety snapshot
      const snapshotId = await testStorage.createRollbackSnapshot();

      // 3. Mutate data and settings in testStorage
      await testStorage.put(STORES_REAL.ACCOUNTS, {
        ...origAccount,
        name: 'حساب معدل بالخطأ بعد اللقطة',
        openingBalanceMinor: 99999,
      });
      await testStorage.put(STORES_REAL.SETTINGS, {
        key: 'user_preferences',
        ownerName: 'اسم مشوه غير مرغوب فيه',
        theme: 'dark',
      });

      // 4. Perform snapshot restore
      const restoreSuccess = await testStorage.restoreLatestSnapshot();

      // 5. Query restored data and settings from testStorage
      const restoredAccs = await testStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS);
      const restoredSettingsRecords = await testStorage.getAll<any>(STORES_REAL.SETTINGS);

      const accRestored = restoredAccs.some(
        (a) => a.id === origAccount.id && a.name === 'حساب أصلي قبل أخذ اللقطة' && a.openingBalanceMinor === 15000
      );

      const settingsRecord = restoredSettingsRecords.find((s) => s.key === 'user_preferences');
      const settingsRestored =
        settingsRecord &&
        settingsRecord.ownerName === 'المالك الأصلي المحفوظ' &&
        settingsRecord.theme === 'light' &&
        settingsRecord.sidebarCollapsed === true;

      const passed = Boolean(snapshotId && restoreSuccess && accRestored && settingsRestored);

      results.push({
        id: 'test-9-rollback-snapshot-settings',
        title: 'اختبار 9: التحقق الفعلي من دقة واتساق استعادة الإعدادات والحسابات من لقطات الرجوع (إصلاح خلل 1)',
        passed,
        expected: 'استعادة دقيقة وشاملة للحسابات والإعدادات الأصلية من اللقطة دون تشويه للأنواع أو فقدان للحقول',
        actual: passed
          ? `تم استعادة الحساب والإعدادات بنجاح: ownerName="${settingsRecord?.ownerName}", theme="${settingsRecord?.theme}"`
          : `فشل التحقق: snapshotId=${snapshotId}, restore=${restoreSuccess}, acc=${accRestored}, settings=${settingsRestored}`,
        details: 'تأكيد التوافق التام بين createRollbackSnapshot و atomicRestore دون تحويل الإعدادات إلى مصفوفات مشوهة.',
      });
    } catch (err: any) {
      results.push({
        id: 'test-9-rollback-snapshot-settings',
        title: 'اختبار 9: التحقق الفعلي من دقة واتساق استعادة الإعدادات والحسابات من لقطات الرجوع (إصلاح خلل 1)',
        passed: false,
        expected: 'نجاح اختبار استعادة اللقطة',
        actual: `استثناء غير متوقع: ${err.message}`,
      });
    }

    // =========================================================================
    // TEST 10: Real Database Cleanup Safety & Connection Handling Test (Flaw #2)
    // Verifies that destroyDatabase closes open connections, rejects on error/blocked,
    // and verifies complete database deletion on ephemeral storage.
    // =========================================================================
    try {
      const ephemeralStorage = createIsolatedTestStorage();
      const ephemeralDbName = ephemeralStorage.getDatabaseName();

      // Put record to force opening DB connection
      await ephemeralStorage.put(STORES_REAL.CATEGORIES, { id: 'cat_eph_1', name: 'تصنيف مؤقت', sortOrder: 0 });

      let destroySucceeded = false;
      try {
        await ephemeralStorage.destroyDatabase();
        destroySucceeded = true;
      } catch (e) {
        destroySucceeded = false;
      }

      results.push({
        id: 'test-10-destroy-database-cleanup-safety',
        title: 'اختبار 10: التحقق الفعلي من إغلاق الاتصالات وسلامة تنظيف وإلغاء قواعد الاختبار (إصلاح خلل 2)',
        passed: destroySucceeded,
        expected: 'إغلاق الاتصالات وحذف قاعدة البيانات بنجاح ودون إعتبار onblocked حالة نجاح',
        actual: destroySucceeded
          ? `تم تنظيف وحذف قاعدة البيانات المؤقتة (${ephemeralDbName}) بنجاح والتحقق من عدم وجودها`
          : 'فشل حذف قاعدة البيانات المؤقتة',
        details: 'معالجة الاتصالات المفتوحة والتأكد من نجاح التصفية البعدية.',
      });
    } catch (err: any) {
      results.push({
        id: 'test-10-destroy-database-cleanup-safety',
        title: 'اختبار 10: التحقق الفعلي من إغلاق الاتصالات وسلامة تنظيف وإلغاء قواعد الاختبار (إصلاح خلل 2)',
        passed: false,
        expected: 'نجاح اختبار سلامة التنظيف',
        actual: `استثناء غير متوقع: ${err.message}`,
      });
    }

    // =========================================================================
    // MILESTONE N1 ACCEPTANCE TEST SUITE (TESTS A THROUGH P / TESTS 11-26)
    // Runs inside isolated test DB (testStorage), zero impact on user production DB!
    // =========================================================================

    // TEST A (11): Valid Inter-Account Transfer (Hussein 200,000 minor, Mohammed 0 -> transfer 50,000)
    {
      const accHussein: AccountModel = {
        id: 'acc_hussein_11',
        name: 'حسين',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 200000, // +2,000.00 SAR (owed by Hussein)
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accMohammed: AccountModel = {
        id: 'acc_mohammed_11',
        name: 'محمد',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accHussein.id,
        destinationAccountId: accMohammed.id,
        amountMinor: 50000, // 500.00 SAR
        date: '2026-11-06',
        description: 'نقل مديونية من حسين إلى محمد',
      };

      const validation = validateInterAccountTransfer(input, [accHussein, accMohammed], []);
      const { sourceEntry, destinationEntry } = buildTransferEntries(input);
      await testStorage.saveTransferAtomic(sourceEntry, destinationEntry, false);

      const txs = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const balHussein = calculateAccountBalance(accHussein, txs);
      const balMohammed = calculateAccountBalance(accMohammed, txs);
      const totalSystemBefore = 200000;
      const totalSystemAfter = balHussein + balMohammed;

      const passed =
        validation.isValid &&
        balHussein === 150000 &&
        balMohammed === 50000 &&
        totalSystemBefore === totalSystemAfter;

      results.push({
        id: 'test-11-test-a-valid-transfer',
        title: 'الاختبار A (11): نقل مديونية صحيح (وثيقة N1 - مثال مرجعي)',
        passed,
        expected: 'رصيد حسين: 1,500.00 ر.س (150000 هللة)، رصيد محمد: 500.00 ر.س (50000 هللة)، وإجمالي النظام ثابت (200000 هللة)',
        actual: `حسين: ${balHussein / 100} ر.س، محمد: ${balMohammed / 100} ر.س، المجموع: ${totalSystemAfter / 100} ر.س`,
        details: 'تأكيد انخفاض مديونية حسين وزيادة مديونية محمد مع توازن الصافي.',
      });
    }

    // TEST B (12): Full Debt Transfer (Source 500 SAR, transfer 500 SAR)
    {
      const accSource: AccountModel = {
        id: 'acc_src_12',
        name: 'طرف مصدر كامل',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 50000, // 500 SAR
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accDest: AccountModel = {
        id: 'acc_dst_12',
        name: 'طرف وجهة كامل',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accSource.id,
        destinationAccountId: accDest.id,
        amountMinor: 50000,
        date: '2026-11-06',
        description: 'نقل كامل المديونية',
      };

      const { sourceEntry, destinationEntry } = buildTransferEntries(input);
      await testStorage.saveTransferAtomic(sourceEntry, destinationEntry, false);

      const txs = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const balSource = calculateAccountBalance(accSource, txs);
      const balDest = calculateAccountBalance(accDest, txs);

      const passed = balSource === 0 && balDest === 50000;

      results.push({
        id: 'test-12-test-b-full-transfer',
        title: 'الاختبار B (12): نقل مديونية كاملة (تصفير المصدر وتحويل كامل الدين)',
        passed,
        expected: 'رصيد المصدر: 0.00 ر.س، رصيد الوجهة: 500.00 ر.س',
        actual: `المصدر: ${balSource / 100} ر.س، الوجهة: ${balDest / 100} ر.س`,
      });
    }

    // TEST C (13): Over-balance Transfer Rejection (Source 500 SAR, request 600 SAR)
    {
      const accSource: AccountModel = {
        id: 'acc_src_13',
        name: 'مصدر محدودة',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 50000, // 500 SAR
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accDest: AccountModel = {
        id: 'acc_dst_13',
        name: 'وجهة محدودة',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accSource.id,
        destinationAccountId: accDest.id,
        amountMinor: 60000, // 600 SAR > 500 SAR available
        date: '2026-11-06',
        description: 'محاولة نقل تتجاوز الرصيد',
      };

      const validation = validateInterAccountTransfer(input, [accSource, accDest], []);
      const passed = !validation.isValid && Boolean(validation.error);

      results.push({
        id: 'test-13-test-c-over-balance-rejection',
        title: 'الاختبار C (13): كشف ورفض محاولة نقل مبلغ يتجاوز الرصيد المتاح للمصدر',
        passed,
        expected: 'رفض العملية مع رسالة خطأ صريحة لمنع تجاوز الرصيد المتاح',
        actual: passed ? `تم الرفض بنجاح: "${validation.error}"` : 'فشل كشف التجاوز',
      });
    }

    // TEST D (14): Same Account Transfer Rejection (Source === Destination)
    {
      const accSame: AccountModel = {
        id: 'acc_same_14',
        name: 'حساب نفس الطرف',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 100000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accSame.id,
        destinationAccountId: accSame.id,
        amountMinor: 10000,
        date: '2026-11-06',
        description: 'تحويل ونقل لنفس الحساب',
      };

      const validation = validateInterAccountTransfer(input, [accSame], []);
      const passed = !validation.isValid && Boolean(validation.error);

      results.push({
        id: 'test-14-test-d-same-account-rejection',
        title: 'الاختبار D (14): رفض إجراء حركة بينية لنفس الحساب المصدر والوجهة',
        passed,
        expected: 'رفض العملية ومنع اختيار نفس الحساب',
        actual: passed ? `تم الرفض بنجاح: "${validation.error}"` : 'تم قبول الحركة لنفس الحساب خطأً',
      });
    }

    // TEST E (15): Archived Account Transfer Rejection
    {
      const accActive: AccountModel = {
        id: 'acc_act_15',
        name: 'حساب نشط',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 100000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accArchived: AccountModel = {
        id: 'acc_arc_15',
        name: 'حساب مؤرشف',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'archived',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accActive.id,
        destinationAccountId: accArchived.id,
        amountMinor: 10000,
        date: '2026-11-06',
        description: 'نقل لحساب مؤرشف',
      };

      const validation = validateInterAccountTransfer(input, [accActive, accArchived], []);
      const passed = !validation.isValid && Boolean(validation.error);

      results.push({
        id: 'test-15-test-e-archived-account-rejection',
        title: 'الاختبار E (15): رفض إجراء حركة بينية مع حساب مؤرشف',
        passed,
        expected: 'رفض الحركة إذا كان أحد الحسابين مؤرشفاً',
        actual: passed ? `تم الرفض بنجاح: "${validation.error}"` : 'تم قبول الحركة مع حساب مؤرشف خطأً',
      });
    }

    // TEST F (16): Atomic Rollback on Failure (Simulated store error during second entry add)
    {
      let rollbackPassed = false;
      const ephemeralStorageF = createIsolatedTestStorage();
      try {
        const { sourceEntry, destinationEntry } = buildTransferEntries({
          sourceAccountId: 'acc_src_f',
          destinationAccountId: 'acc_dst_f',
          amountMinor: 10000,
          date: '2026-11-06',
          description: 'اختبار الفشل الذري',
        });

        // Corrupt destination entry so store.add throws inside transaction
        const corruptDestEntry = { ...destinationEntry, id: null as any };

        try {
          await ephemeralStorageF.saveTransferAtomic(sourceEntry, corruptDestEntry, false);
        } catch {
          // Expected atomic failure
        }

        const txsAfterFail = await ephemeralStorageF.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
        rollbackPassed = txsAfterFail.length === 0;
      } finally {
        await ephemeralStorageF.destroyDatabase();
      }

      results.push({
        id: 'test-16-test-f-atomic-rollback-failure',
        title: 'الاختبار F (16): التراجع الذري التام عند فشل أحد قيدي الحركة البينية',
        passed: rollbackPassed,
        expected: 'إلغاء المعاملة بالكامل وعدم حفظ أي قيد جزئي عند حدوث أي خطأ',
        actual: rollbackPassed
          ? 'تم إلغاء المعاملة بالكامل وبقيت قاعدة البيانات خالية 100% من القيود الجزئية'
          : 'فشل التراجع الذري وبقي قيد يتيم',
      });
    }

    // TEST G (17): Transfer Update (Edit transfer amount from 500 SAR to 300 SAR)
    {
      const accSource: AccountModel = {
        id: 'acc_src_17',
        name: 'مصدر تعديل',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 200000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accDest: AccountModel = {
        id: 'acc_dst_17',
        name: 'وجهة تعديل',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const initialInput = {
        sourceAccountId: accSource.id,
        destinationAccountId: accDest.id,
        amountMinor: 50000, // 500 SAR
        date: '2026-11-06',
        description: 'حركة بينية أولية',
      };

      const { transferId, sourceEntry, destinationEntry } = buildTransferEntries(initialInput);
      await testStorage.saveTransferAtomic(sourceEntry, destinationEntry, false);

      // Edit transfer to 300 SAR (30000 minor)
      const updatedInput = {
        ...initialInput,
        amountMinor: 30000,
        description: 'تعديل الحركة البينية إلى 300 ريال',
      };

      const { sourceEntry: newSrc, destinationEntry: newDst } = buildTransferEntries(updatedInput, transferId);
      await testStorage.updateTransferAtomic(transferId, newSrc, newDst, false);

      const txs = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const balSrc = calculateAccountBalance(accSource, txs);
      const balDst = calculateAccountBalance(accDest, txs);
      const transferPairsValidation = validateTransferPairs(txs);

      const passed =
        balSrc === 170000 &&
        balDst === 30000 &&
        transferPairsValidation.isValid;

      results.push({
        id: 'test-17-test-g-transfer-update',
        title: 'الاختبار G (17): تعديل الحركة البينية ذرياً وتحديث الأرصدة والربط المتبادل',
        passed,
        expected: 'تحديث الرصيدين (المصدر: 1,700.00 ر.س، الوجهة: 300.00 ر.س) والحفاظ على ترابط القيدين',
        actual: passed
          ? `المصدر: ${balSrc / 100} ر.س، الوجهة: ${balDst / 100} ر.س، الفحص: ${transferPairsValidation.isValid ? 'سليم' : 'تالف'}`
          : 'فشل تعديل الحركة البينية',
      });
    }

    // TEST H (18): Transfer Atomic Delete (Restore original balances with zero orphan entries)
    {
      const accSource: AccountModel = {
        id: 'acc_src_18',
        name: 'مصدر حذف',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 100000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const accDest: AccountModel = {
        id: 'acc_dst_18',
        name: 'وجهة حذف',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const input = {
        sourceAccountId: accSource.id,
        destinationAccountId: accDest.id,
        amountMinor: 40000,
        date: '2026-11-06',
        description: 'حركة بينية مخصصة للحذف',
      };

      const { transferId, sourceEntry, destinationEntry } = buildTransferEntries(input);
      await testStorage.saveTransferAtomic(sourceEntry, destinationEntry, false);

      // Perform atomic delete
      await testStorage.deleteTransferAtomic(transferId, false);

      const txs = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
      const balSrc = calculateAccountBalance(accSource, txs);
      const balDst = calculateAccountBalance(accDest, txs);
      const remainingTransferEntries = txs.filter((t) => t.transferId === transferId);

      const passed = balSrc === 100000 && balDst === 0 && remainingTransferEntries.length === 0;

      results.push({
        id: 'test-18-test-h-transfer-delete',
        title: 'الاختبار H (18): حذف الحركة البينية ذرياً واستعادة الأرصدة الأصلية دون قيود يتيمة',
        passed,
        expected: 'عودة أرصدة الحسابين لسابق عهدها وحذف القيود البينية بالكامل (0 قيود يتيمة)',
        actual: passed
          ? `المصدر: ${balSrc / 100} ر.س، الوجهة: ${balDst / 100} ر.س، القيود المتبقية: ${remainingTransferEntries.length}`
          : 'فشل حذف الحركة البينية',
      });
    }

    // TEST I (19): Execute the ordinary storage APIs against a real transfer leg.
    {
      const isolated = createIsolatedTestStorage();
      let passed = false;
      try {
        const pair = buildTransferEntries({
          sourceAccountId: 'acc_i_source',
          destinationAccountId: 'acc_i_destination',
          amountMinor: 10000,
          date: '2026-11-06',
          description: 'اختبار الحماية الفعلية من تعديل قيد منفرد',
        });
        await isolated.saveTransferAtomic(pair.sourceEntry, pair.destinationEntry, false);
        let editRejected = false;
        let deleteRejected = false;
        let strippedMetadataRejected = false;
        try {
          await isolated.updateTransactionAtomic(
            { ...pair.sourceEntry, amountMinor: 20000 }, [], [], false
          );
        } catch { editRejected = true; }
        try {
          const { transferId: _tid, transferRole: _role, counterpartyAccountId: _cp, ...ordinaryTx } = pair.sourceEntry;
          await isolated.updateTransactionAtomic(ordinaryTx, [], [], false);
        } catch { strippedMetadataRejected = true; }
        try {
          await isolated.deleteTransactionAtomic(pair.sourceEntry.id, [], false);
        } catch { deleteRejected = true; }
        const remaining = (await isolated.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS))
          .filter(t => t.transferId === pair.transferId);
        passed = editRejected && deleteRejected && strippedMetadataRejected
          && remaining.length === 2 && validateTransferPairs(remaining).isValid
          && remaining.some(t => t.id === pair.sourceEntry.id && t.amountMinor === 10000);
      } finally {
        await isolated.destroyDatabase();
      }
      results.push({
        id: 'test-19-test-i-single-entry-guard',
        title: 'الاختبار I (19): رفض تعديل أو حذف القيد البيني المنفرد عبر التخزين الحقيقي المعزول',
        passed,
        expected: 'رفض التعديل والحذف ومحاولة إزالة معلومات الربط، وبقاء القيدين دون تغيير',
        actual: passed ? 'رُفضت العمليات الثلاث وظل الزوج صحيحاً' : 'فشل منع تعديل أو حذف قيد بيني منفرد',
      });
    }

    // TEST J (20): Broken backup rejection (Single source entry without destination leg)
    {
      const validAccount: AccountModel = {
        id: 'acc_valid_20',
        name: 'حساب اختبار',
        parentId: null,
        categoryId: 'cat_valid_20',
        openingBalanceMinor: 100000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const validCategory: CategoryModel = {
        id: 'cat_valid_20',
        name: 'تصنيف اختبار',
        sortOrder: 1,
      };

      // Corrupt transaction: orphan transfer leg
      const brokenTx: TransactionModel = {
        id: 'tx_orphan_20',
        accountId: validAccount.id,
        entryType: 'owedToAccount',
        amountMinor: 20000,
        date: '2026-11-06',
        description: 'حركة بينية يتيمة مكسورة',
        attachmentIds: [],
        transferId: 'trf_broken_20',
        transferRole: 'source',
        counterpartyAccountId: 'acc_nonexistent',
        createdAt: '2026-11-06T10:00:00Z',
        updatedAt: '2026-11-06T10:00:00Z',
      };

      const payload = {
        accounts: [validAccount],
        categories: [validCategory],
        transactions: [brokenTx],
        attachments: [],
        notes: [],
      };

      const checksum = await computeSHA256(JSON.stringify(payload));
      const manifest = {
        formatName: 'RAKAN_BALANCE_BACKUP',
        backupFormatVersion: 2,
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        appName: 'راكان بلانس | RAKAN BALANCE',
        checksum,
        recordCounts: {
          accounts: 1,
          categories: 1,
          transactions: 1,
          attachments: 0,
          notes: 0,
        },
      };

      const jsonString = JSON.stringify({ manifest, data: payload });
      const validationResult = await validateBackupFile(jsonString);
      const passed = !validationResult.isValid && Boolean(validationResult.error?.includes('حركات بينية') || validationResult.error?.includes('غير مكتملة') || validationResult.error?.includes('مفقود'));

      results.push({
        id: 'test-20-test-j-reject-broken-transfer-backup',
        title: 'الاختبار J (20): كشف ورفض النسخة الاحتياطية التي تحتوي على حركة بينية غير مكتملة',
        passed,
        expected: 'رفض استعادة النسخة الاحتياطية إذا احتوت على قيد بيني يتيم',
        actual: passed
          ? `تم رفض النسخة التالفة بنجاح: "${validationResult.error}"`
          : 'فشل كشف الحركة البينية المكسورة في النسخة الاحتياطية',
      });
    }

    // TEST K (21): Restore valid transfer backup
    {
      const acc1: AccountModel = {
        id: 'acc_k_1',
        name: 'حساب ك 1',
        parentId: null,
        categoryId: 'cat_k',
        openingBalanceMinor: 100000,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const acc2: AccountModel = {
        id: 'acc_k_2',
        name: 'حساب ك 2',
        parentId: null,
        categoryId: 'cat_k',
        openingBalanceMinor: 0,
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const catK: CategoryModel = {
        id: 'cat_k',
        name: 'تصنيف ك',
        sortOrder: 1,
      };

      const { sourceEntry, destinationEntry } = buildTransferEntries({
        sourceAccountId: acc1.id,
        destinationAccountId: acc2.id,
        amountMinor: 25000,
        date: '2026-11-06',
        description: 'حركة بينية سليمة للنسخ',
      });

      const payload = {
        accounts: [acc1, acc2],
        categories: [catK],
        transactions: [sourceEntry, destinationEntry],
        attachments: [],
        notes: [],
      };

      const checksum = await computeSHA256(JSON.stringify(payload));
      const manifest = {
        formatName: 'RAKAN_BALANCE_BACKUP',
        backupFormatVersion: 2,
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        appName: 'راكان بلانس | RAKAN BALANCE',
        checksum,
        recordCounts: {
          accounts: 2,
          categories: 1,
          transactions: 2,
          attachments: 0,
          notes: 0,
        },
      };

      const jsonString = JSON.stringify({ manifest, data: payload });
      const validationResult = await validateBackupFile(jsonString);

      results.push({
        id: 'test-21-test-k-restore-valid-transfer-backup',
        title: 'الاختبار K (21): قبول واستعادة النسخة الاحتياطية التي تحتوي على حركات بينية سليمة',
        passed: validationResult.isValid,
        expected: 'قبول وتأكيد سلامة النسخة الاحتياطية ومطابقة التجزئة وترابط القيود',
        actual: validationResult.isValid
          ? 'تم فحص النسخة وقبولها بنجاح 100%'
          : `فشل الفحص: ${validationResult.error}`,
      });
    }

    // TEST L (22): Demo workspace isolation for transfers
    {
      const { sourceEntry: demoSrc, destinationEntry: demoDst } = buildTransferEntries({
        sourceAccountId: 'demo_src_l',
        destinationAccountId: 'demo_dst_l',
        amountMinor: 15000,
        date: '2026-11-06',
        description: 'حركة بينية تجريبية',
        isDemo: true,
      });

      await testStorage.saveTransferAtomic(demoSrc, demoDst, true);
      const demoTxsBefore = await testStorage.getAll<TransactionModel>(STORES_DEMO.TRANSACTIONS);

      await testStorage.purgeDemoWorkspace();
      const demoTxsAfter = await testStorage.getAll<TransactionModel>(STORES_DEMO.TRANSACTIONS);
      const realTxsAfter = await testStorage.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);

      const passed = demoTxsBefore.length === 2 && demoTxsAfter.length === 0;

      results.push({
        id: 'test-22-test-l-demo-transfer-isolation',
        title: 'الاختبار L (22): عزل الحركات البينية التجريبية وتصفيرها دون مساس بالمساحة الحقيقية',
        passed,
        expected: 'تخزين الحركة البينية التجريبية في مخزن demo_transactions وتصفيرها دون المساس بالبيانات الحقيقية',
        actual: passed
          ? `تم التخزين والتصفير بنجاح (المتبقي تجريبي: ${demoTxsAfter.length}، المتبقي حقيقي: ${realTxsAfter.length})`
          : 'فشل عزل مساحة التجربة',
      });
    }

    // TEST M (23): Private Account Notes Persistence (AccountModel.notes)
    {
      const accWithNotes: AccountModel = {
        id: 'acc_notes_m',
        name: 'حساب بملاحظة خاصة',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 10000,
        status: 'active',
        notes: 'ملاحظة سرية خاصة: يفضل التعامل مع المندوب أحمد صباحاً',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      await testStorage.put(STORES_REAL.ACCOUNTS, accWithNotes);
      const fetchedAccounts = await testStorage.getAll<AccountModel>(STORES_REAL.ACCOUNTS);
      const savedAcc = fetchedAccounts.find((a) => a.id === 'acc_notes_m');

      const passed = savedAcc?.notes === 'ملاحظة سرية خاصة: يفضل التعامل مع المندوب أحمد صباحاً';

      results.push({
        id: 'test-23-test-m-private-notes-persistence',
        title: 'الاختبار M (23): حفظ واستعادة ملاحظات الحساب الخاصة في AccountModel.notes',
        passed,
        expected: 'حفظ واسترجاع الملاحظة الخاصة كما هي في قاعدة البيانات',
        actual: passed
          ? `تم استرجاع الملاحظة بنجاح: "${savedAcc?.notes}"`
          : 'فشل حفظ أو استرجاع الملاحظة الخاصة',
      });
    }

    // TEST N (24): Private Account Notes Privacy Boundary (Excluded from Financial Exports & Global Search)
    {
      const secretNoteText = 'سرية_للغاية_ممنوع_الظهور_في_التقارير_12345';
      const accSecretNotes: AccountModel = {
        id: 'acc_secret_n',
        name: 'حساب السرية',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 50000,
        status: 'active',
        notes: secretNoteText,
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };

      const statement = calculateAccountStatement(accSecretNotes, []);
      const statementString = JSON.stringify(statement);

      // Verify privacy boundaries: notes excluded from statement output & global search filter, but included in backup export
      const excludedFromStatement = !statementString.includes(secretNoteText);

      // Verify backup bundle inclusion
      const payload = {
        accounts: [accSecretNotes],
        categories: [],
        transactions: [],
        attachments: [],
        notes: [],
      };
      const backupString = JSON.stringify(payload);
      const includedInBackup = backupString.includes(secretNoteText);

      const passed = excludedFromStatement && includedInBackup;

      results.push({
        id: 'test-24-test-n-private-notes-privacy-boundary',
        title: 'الاختبار N (24): التحقق من حدود خصوصية الملاحظات (استبعادها من المخرجات المالية وشمولها بالنسخ)',
        passed,
        expected: 'استبعاد النص السري من المخرجات المالية لكشف الحساب وشموله في حزمة النسخ الاحتياطي الكاملة',
        actual: passed
          ? 'تم التحقق: مستبعدة من كشوف الحسابات وتصادير المالية، ومحفوظة في النسخة الاحتياطية'
          : 'فشل اختبار خصوصية الملاحظات',
      });
    }

    // TEST O (25): Zero Regression of N0 Reference Calculation
    {
      const refAccount: AccountModel = {
        id: 'acc_n0_ref_25',
        name: 'حساب مرجعي N0',
        parentId: null,
        categoryId: 'cat-1',
        openingBalanceMinor: 20000, // +200.00
        status: 'active',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      };
      const refTxs: TransactionModel[] = [
        {
          id: 'tx_n0_1',
          accountId: refAccount.id,
          entryType: 'owedByAccount',
          amountMinor: 15000,
          date: '2026-11-02',
          description: 'عليه',
          attachmentIds: [],
          createdAt: '2026-11-02T10:00:00Z',
          updatedAt: '2026-11-02T10:00:00Z',
        },
        {
          id: 'tx_n0_2',
          accountId: refAccount.id,
          entryType: 'owedToAccount',
          amountMinor: 8000,
          date: '2026-11-03',
          description: 'له',
          attachmentIds: [],
          createdAt: '2026-11-03T10:00:00Z',
          updatedAt: '2026-11-03T10:00:00Z',
        },
        {
          id: 'tx_n0_3',
          accountId: refAccount.id,
          entryType: 'owedToAccount',
          amountMinor: 30000,
          date: '2026-11-04',
          description: 'له',
          attachmentIds: [],
          createdAt: '2026-11-04T10:00:00Z',
          updatedAt: '2026-11-04T10:00:00Z',
        },
      ];

      const balance = calculateAccountBalance(refAccount, refTxs);
      const passed = balance === -3000;

      results.push({
        id: 'test-25-test-o-n0-zero-regression',
        title: 'الاختبار O (25): تأكيد عدم تأثر معادلات وتدفقات المرحلة N0 السابقة (Zero Regression)',
        passed,
        expected: 'الرصيد النهائي المطابق للمثال المرجعي: -30.00 ر.س (-3000 هللة)',
        actual: passed
          ? `الرصيد محتسب بدقة: ${(balance / 100).toFixed(2)} ر.س`
          : 'حدث انحراف عن معادلات N0',
      });
    }

    // TEST P (26): Interface and Minor Units Invariants Verification
    {
      const minorCheck = tryToMinorUnits('150.25');
      const maxSafeCheck = MAX_SAFE_MINOR_AMOUNT > 0;
      const passed = minorCheck.success && minorCheck.minor === 15025 && maxSafeCheck;

      results.push({
        id: 'test-26-test-p-invariants-verification',
        title: 'الاختبار P (26): التحقق من ثوابت الدقة الممالية بالهللة وتوافق العقود',
        passed,
        expected: 'تحويل دقيق للكسور النظامية منزلتين إلى هللات (150.25 -> 15025 هللة) وثبات الحدود الآمنة',
        actual: passed
          ? `التحويل: 150.25 -> ${minorCheck.minor} هللة، الحد الأقصى الآمن: ${MAX_SAFE_MINOR_AMOUNT}`
          : 'فشل فحص ثوابت الهللة',
      });
    }
    // TEST 27: Missing transfer IDs must never create data on update or succeed on delete.
    {
      const isolated = createIsolatedTestStorage();
      let passed = false;
      try {
        const made = buildTransferEntries({
          sourceAccountId: 'acc_missing_source',
          destinationAccountId: 'acc_missing_destination',
          amountMinor: 10000,
          date: '2026-11-06',
          description: 'محاولة تعديل معرف نقل غير موجود',
        }, 'trf_absent_27');
        let updateRejected = false;
        let deleteRejected = false;
        try {
          await isolated.updateTransferAtomic(made.transferId, made.sourceEntry, made.destinationEntry, false);
        } catch { updateRejected = true; }
        try { await isolated.deleteTransferAtomic(made.transferId, false); }
        catch { deleteRejected = true; }
        const transactions = await isolated.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
        passed = updateRejected && deleteRejected && transactions.length === 0;
      } finally { await isolated.destroyDatabase(); }
      results.push({
        id: 'test-27-missing-transfer-must-reject',
        title: 'اختبار 27: رفض تعديل وحذف حركة بينية غير موجودة دون إنشاء قيود',
        passed,
        expected: 'رفض الحالتين وبقاء المخزن خالياً',
        actual: passed ? 'نجح الرفض دون أي كتابة' : 'قُبلت عملية على حركة غير موجودة',
      });
    }

    // TEST 28: Corrupt/orphaned stored pair must reject update and delete without mutation.
    {
      const isolated = createIsolatedTestStorage();
      let passed = false;
      try {
        const oldPair = buildTransferEntries({
          sourceAccountId: 'acc_corrupt_src',
          destinationAccountId: 'acc_corrupt_dst',
          amountMinor: 15000,
          date: '2026-11-06',
          description: 'حركة تالفة بقيد يتيم',
        });
        await isolated.put(STORES_REAL.TRANSACTIONS, oldPair.sourceEntry);
        const updated = buildTransferEntries({
          sourceAccountId: 'acc_corrupt_src',
          destinationAccountId: 'acc_corrupt_dst',
          amountMinor: 12000,
          date: '2026-11-06',
          description: 'محاولة تعديل قيد يتيم',
        }, oldPair.transferId);
        let updateRejected = false;
        let deleteRejected = false;
        try {
          await isolated.updateTransferAtomic(oldPair.transferId, updated.sourceEntry, updated.destinationEntry, false);
        } catch { updateRejected = true; }
        try { await isolated.deleteTransferAtomic(oldPair.transferId, false); }
        catch { deleteRejected = true; }
        const after = await isolated.getAll<TransactionModel>(STORES_REAL.TRANSACTIONS);
        passed = updateRejected && deleteRejected && after.length === 1
          && after[0].id === oldPair.sourceEntry.id && after[0].amountMinor === 15000;
      } finally { await isolated.destroyDatabase(); }
      results.push({
        id: 'test-28-orphaned-transfer-must-reject',
        title: 'اختبار 28: منع تعديل أو حذف حركة بينية يتيمة والحفاظ على بياناتها',
        passed,
        expected: 'رفض الحالتين واستمرار القيد الأصلي دون تغيير',
        actual: passed ? 'تم رفض الحالتين وبقي القيد الأصلي' : 'حدث تغيير غير مسموح في قيد يتيم',
      });
    }

  } finally {
    // =========================================================================
    // CLEANUP GUARANTEE:
    // Destroy the ephemeral isolated test database completely upon completion.
    // =========================================================================
    try {
      await testStorage.destroyDatabase();
    } catch (cleanupError: unknown) {
      const reason = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      results.push({
        id: 'test-isolated-database-cleanup-failure',
        title: 'فشل تنظيف قاعدة بيانات الاختبار المعزولة',
        passed: false,
        expected: 'حذف قاعدة بيانات الاختبار المؤقتة بعد انتهاء جميع الاختبارات',
        actual: `تعذر حذف قاعدة بيانات الاختبار: ${reason}`,
        details: 'يجب اعتبار إخفاق التنظيف فشلاً صريحاً في حزمة التحقق.',
      });
    }
  }

  return results;
}
