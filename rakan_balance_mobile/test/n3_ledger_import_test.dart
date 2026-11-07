import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/financial/money_utils.dart';
import 'package:rakan_balance_mobile/domain/importing/ledger_import_service.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('generated-style UTF-8 BOM CSV headers are recognized', () async {
    final csv = '\uFEFFexternalRef,name,category,openingBalance,phone,notes\n'
        'A-001,أحمد,أفراد,0.00,0500000000,';
    final preview = await LedgerImportService.previewFile(
      bytes: Uint8List.fromList(utf8.encode(csv)),
      fileName: 'accounts.csv',
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.blockingIssues, isEmpty);
    expect(preview.accounts, hasLength(1));
    expect(preview.accounts.single.externalRef, 'A-001');
    expect(preview.accounts.single.name, 'أحمد');
    expect(preview.canCommit, true);
  });

  test('generated XLSX template round-trips through the import preview', () async {
    final bytes = LedgerImportService.buildXlsxTemplate();
    expect(bytes, isNotEmpty);

    final preview = await LedgerImportService.previewFile(
      bytes: bytes,
      fileName: 'rakan_import_template.xlsx',
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.blockingIssues, isEmpty);
    expect(preview.accounts, hasLength(1));
    expect(preview.transactions, hasLength(1));
    expect(preview.accounts.single.externalRef, 'A-001');
    expect(preview.transactions.single.accountRef, 'A-001');
    expect(preview.transactions.single.amountMinor, 12550);
    expect(preview.canCommit, true);
  });

  test('validation and commit reports are UTF-8 CSV with visible outcomes', () {
    const preview = LedgerImportPreview(
      sourceName: 'input.csv',
      accounts: [],
      transactions: [],
      issues: [
        ImportIssue(
          section: 'accounts',
          rowNumber: 2,
          message: 'حساب مكرر',
          blocking: false,
        ),
      ],
    );
    const result = LedgerImportCommitResult(
      importedAccounts: 2,
      skippedAccounts: 1,
      importedTransactions: 3,
      skippedTransactions: 1,
    );

    final validation = LedgerImportService.buildIssuesCsv(preview);
    final committed = LedgerImportService.buildCommitReportCsv(
      preview: preview,
      result: result,
    );

    expect(validation.startsWith('\uFEFF'), true);
    expect(validation, contains('حساب مكرر'));
    expect(validation, contains('تنبيه'));
    expect(committed.startsWith('\uFEFF'), true);
    expect(committed, contains('تم التنفيذ ذريًا'));
    expect(committed, contains('الحسابات المستوردة,2'));
    expect(committed, contains('الحركات المستوردة,3'));
  });

  test('mixed CSV preserves the original source row in validation issues', () async {
    final csv = 'recordType,externalRef,name,category,openingBalance,accountRef,entryType,amount,date,description\n'
        'account,A-1,عميل,عام,0.00,,,,,\n'
        'unknown,,,,,,,,,سجل غير معروف\n'
        'transaction,,,,,A-1,لك,5.00,2026-11-07,فاتورة';
    final preview = await LedgerImportService.previewFile(
      bytes: Uint8List.fromList(utf8.encode(csv)),
      fileName: 'mixed.csv',
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.accounts, hasLength(1));
    expect(preview.transactions, hasLength(1));
    expect(preview.blockingIssues, hasLength(1));
    expect(preview.blockingIssues.single.rowNumber, 3);
    expect(preview.blockingIssues.single.message, contains('نوع السجل غير معروف'));
  });

  test('preview detects duplicates and resolves imported account references', () {
    final existingAccount = AccountModel(
      id: 'existing',
      name: 'موجود',
      categoryId: 'cat',
      openingBalanceMinor: 0,
      createdAt: '',
      updatedAt: '',
    );
    final existingTx = TransactionModel(
      id: 'tx-existing',
      accountId: existingAccount.id,
      entryType: EntryType.owedToAccount,
      amountMinor: 200,
      date: '2026-11-07',
      description: 'دفعة',
      attachmentIds: const [],
      createdAt: '',
      updatedAt: '',
    );

    final preview = LedgerImportService.previewFromRows(
      sourceName: 'test.csv',
      accountRows: [
        {
          'externalref': 'A-1',
          'name': 'جديد',
          'category': 'عام',
          'openingbalance': '10.25',
        },
        {
          'externalref': 'OLD',
          'name': 'موجود',
          'category': 'عام',
          'openingbalance': '0',
        },
      ],
      transactionRows: [
        {
          'accountref': 'A-1',
          'entrytype': 'لك',
          'amount': '15.50',
          'date': '2026-11-06',
          'description': 'فاتورة',
        },
        {
          'accountref': 'موجود',
          'entrytype': 'عليك',
          'amount': '2.00',
          'date': '2026-11-07',
          'description': 'دفعة',
        },
      ],
      existingAccounts: [existingAccount],
      existingTransactions: [existingTx],
    );

    expect(preview.blockingIssues, isEmpty);
    expect(preview.accounts, hasLength(2));
    expect(preview.accounts.first.openingBalanceMinor, 1025);
    expect(preview.accounts.last.duplicate, true);
    expect(preview.transactions, hasLength(2));
    expect(preview.transactions.first.amountMinor, 1550);
    expect(preview.transactions.last.duplicate, true);
    expect(preview.importableAccounts, 1);
    expect(preview.importableTransactions, 1);
    expect(preview.canCommit, true);
  });

  test('preview blocks unknown account, missing direction, invalid date, and negative amount', () {
    final preview = LedgerImportService.previewFromRows(
      sourceName: 'bad.csv',
      accountRows: const [],
      transactionRows: [
        {
          'accountref': 'missing',
          'entrytype': 'لك',
          'amount': '10.00',
          'date': '2026-11-07',
          'description': 'حساب غير موجود',
        },
        {
          'accountref': 'acc1',
          'entrytype': 'اتجاه_باطل',
          'amount': '10.00',
          'date': '2026-11-07',
          'description': 'اتجاه باطل',
        },
        {
          'accountref': 'acc1',
          'entrytype': 'لك',
          'amount': '-25.00',
          'date': '2026-11-07',
          'description': 'مبلغ سالب',
        },
        {
          'accountref': 'acc1',
          'entrytype': 'لك',
          'amount': '25.00',
          'date': '2026-02-30',
          'description': 'تاريخ غير صالح في فبراير',
        },
      ],
      existingAccounts: [
        const AccountModel(
          id: 'acc1',
          name: 'عميل 1',
          categoryId: 'cat',
          openingBalanceMinor: 0,
          createdAt: '',
          updatedAt: '',
        ),
      ],
      existingTransactions: const [],
    );

    expect(preview.canCommit, false);
    expect(preview.blockingIssues.length, greaterThanOrEqualTo(4));
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('مرجع الحساب غير موجود')),
      true,
    );
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('نوع الحركة مطلوب صراحةً')),
      true,
    );
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('موجبًا')),
      true,
    );
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('التاريخ غير صالح')),
      true,
    );
  });

  test('preview rejects amounts exceeding 100 Billion SAR limit and amounts with excess decimals', () {
    final preview = LedgerImportService.previewFromRows(
      sourceName: 'bounds.csv',
      accountRows: [
        {
          'name': 'عميل الحدود',
          'category': 'عام',
          'openingbalance': '100000000000.01',
        },
        {
          'name': 'عميل كسور باطلة',
          'category': 'عام',
          'openingbalance': '12.345',
        },
      ],
      transactionRows: const [],
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.canCommit, false);
    expect(preview.blockingIssues, hasLength(2));
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('الحد التشغيلي المعتمد')),
      true,
    );
    expect(
      preview.blockingIssues.any((issue) => issue.message.contains('الحد الأقصى منزلتان عشريتان')),
      true,
    );
  });

  test('preview gracefully handles corrupted CSV files (non-UTF8 bytes and unmatched quotes)', () async {
    // Non-UTF-8 corrupted bytes
    final corruptBytes = Uint8List.fromList([0xFF, 0xFE, 0xFD, 0x00, 0x80]);
    final previewNonUtf8 = await LedgerImportService.previewFile(
      bytes: corruptBytes,
      fileName: 'corrupt.csv',
      existingAccounts: const [],
      existingTransactions: const [],
    );
    expect(previewNonUtf8.canCommit, false);
    expect(previewNonUtf8.blockingIssues, isNotEmpty);
    expect(previewNonUtf8.blockingIssues.first.message, contains('ترميز الملف غير صالح'));

    // Unmatched quotes corrupted CSV syntax
    final unclosedQuoteCsv = 'name,category\n"أحمد,عام';
    final previewUnclosed = await LedgerImportService.previewFile(
      bytes: Uint8List.fromList(utf8.encode(unclosedQuoteCsv)),
      fileName: 'unclosed.csv',
      existingAccounts: const [],
      existingTransactions: const [],
    );
    expect(previewUnclosed.canCommit, false);
    expect(previewUnclosed.blockingIssues, isNotEmpty);
    expect(previewUnclosed.blockingIssues.first.message, contains('تنسيق CSV غير صالح'));
  });

  test('preview gracefully handles corrupted XLSX files (invalid binary)', () async {
    final corruptXlsxBytes = Uint8List.fromList([0x50, 0x4B, 0x00, 0x00, 0x12, 0x34]);
    final previewCorruptXlsx = await LedgerImportService.previewFile(
      bytes: corruptXlsxBytes,
      fileName: 'broken.xlsx',
      existingAccounts: const [],
      existingTransactions: const [],
    );
    expect(previewCorruptXlsx.canCommit, false);
    expect(previewCorruptXlsx.blockingIssues, isNotEmpty);
    expect(previewCorruptXlsx.blockingIssues.first.message, contains('ملف Excel غير صالح أو تالف'));
  });

  test('preview rejects unsupported file extensions', () async {
    final previewPdf = await LedgerImportService.previewFile(
      bytes: Uint8List.fromList([1, 2, 3]),
      fileName: 'statement.pdf',
      existingAccounts: const [],
      existingTransactions: const [],
    );
    expect(previewPdf.canCommit, false);
    expect(previewPdf.blockingIssues, isNotEmpty);
    expect(previewPdf.blockingIssues.first.message, contains('صيغة الملف غير مدعومة'));
  });

  test('conflicting external refs block import rather than mispost movements', () {
    final preview = LedgerImportService.previewFromRows(
      sourceName: 'conflicting-refs.csv',
      accountRows: [
        {
          'externalref': 'SHARED-1',
          'name': 'الحساب الأول',
          'category': 'عام',
          'openingbalance': '0',
        },
        {
          'externalref': 'SHARED-1',
          'name': 'الحساب الثاني',
          'category': 'عام',
          'openingbalance': '0',
        },
      ],
      transactionRows: [
        {
          'accountref': 'SHARED-1',
          'entrytype': 'لك',
          'amount': '25.00',
          'date': '2026-11-07',
          'description': 'حركة بمرجع ملتبس',
        },
      ],
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.canCommit, false);
    expect(preview.blockingIssues.any(
        (issue) => issue.message.contains('المرجع الخارجي')), true);
  });

  test('external ref cannot impersonate another existing account alias', () {
    final existing = AccountModel(
      id: 'existing-1',
      name: 'الحساب الأصلي',
      categoryId: 'cat',
      openingBalanceMinor: 0,
      createdAt: '',
      updatedAt: '',
    );
    final preview = LedgerImportService.previewFromRows(
      sourceName: 'alias-conflict.csv',
      accountRows: [
        {
          'externalref': 'existing-1',
          'name': 'حساب مختلف',
          'category': 'عام',
          'openingbalance': '0',
        },
      ],
      transactionRows: const [],
      existingAccounts: [existing],
      existingTransactions: const [],
    );

    expect(preview.canCommit, false);
    expect(preview.blockingIssues, isNotEmpty);
  });

  test('atomic import commits account and movement with exact halalas', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      final preview = LedgerImportService.previewFromRows(
        sourceName: 'ok.csv',
        accountRows: [
          {
            'externalref': 'A-1',
            'name': 'عميل جديد',
            'category': 'عملاء',
            'openingbalance': '20.00',
          },
        ],
        transactionRows: [
          {
            'accountref': 'A-1',
            'entrytype': 'لك',
            'amount': '125.50',
            'date': '2026-11-07',
            'description': 'فاتورة',
          },
        ],
        existingAccounts: const [],
        existingTransactions: const [],
      );

      expect(preview.canCommit, true);
      final result = await SqliteStorageAdapter(db).importLedgerAtomic(
        preview: preview,
        isDemo: false,
      );

      expect(result.importedAccounts, 1);
      expect(result.importedTransactions, 1);
      expect(result.skippedAccounts, 0);
      expect(result.skippedTransactions, 0);

      final accounts = await db.query(TablesSchema.accounts);
      expect(accounts, hasLength(1));
      expect(accounts.single['name'], 'عميل جديد');
      expect(accounts.single['openingBalanceMinor'], 2000);

      final transactions = await db.query(TablesSchema.transactions);
      expect(transactions, hasLength(1));
      expect(transactions.single['amountMinor'], 12550);
      expect(transactions.single['entryType'], 'owedByAccount');
      expect(transactions.single['accountId'], accounts.single['id']);
    } finally {
      await db.close();
    }
  });

  test('late SQL failure rolls back the whole import batch and preserves pre-existing records', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      // 1. Seed pre-existing legitimate account and transaction
      await db.insert(TablesSchema.categories, {
        'id': 'cat_existing',
        'name': 'تصنيف قديم',
        'sortOrder': 0,
      });
      await db.insert(TablesSchema.accounts, {
        'id': 'acc_existing',
        'name': 'حساب قديم محفوظ',
        'categoryId': 'cat_existing',
        'openingBalanceMinor': 50000,
        'status': 'active',
        'createdAt': '2026-11-01T00:00:00Z',
        'updatedAt': '2026-11-01T00:00:00Z',
      });
      await db.insert(TablesSchema.transactions, {
        'id': 'tx_existing',
        'accountId': 'acc_existing',
        'entryType': 'owedByAccount',
        'amountMinor': 10000,
        'date': '2026-11-02',
        'description': 'قيد سابق',
        'createdAt': '2026-11-02T00:00:00Z',
        'updatedAt': '2026-11-02T00:00:00Z',
      });

      final preview = LedgerImportService.previewFromRows(
        sourceName: 'rollback.csv',
        accountRows: [
          {
            'externalref': 'A-NEW',
            'name': 'حساب لن يبقى',
            'category': 'اختبار',
            'openingbalance': '5.00',
          },
        ],
        transactionRows: [
          {
            'accountref': 'A-NEW',
            'entrytype': 'لك',
            'amount': '1.00',
            'date': '2026-11-07',
            'description': 'FAIL_TRANSACTION',
          },
        ],
        existingAccounts: const [],
        existingTransactions: const [],
      );

      expect(preview.canCommit, true);

      // Create abort trigger to simulate catastrophic failure mid-transaction
      await db.execute('''
        CREATE TRIGGER block_import_transaction
        BEFORE INSERT ON transactions
        WHEN NEW.description = 'FAIL_TRANSACTION'
        BEGIN
          SELECT RAISE(ABORT, 'simulated import failure');
        END
      ''');

      await expectLater(
        SqliteStorageAdapter(db).importLedgerAtomic(
          preview: preview,
          isDemo: false,
        ),
        throwsException,
      );

      // Verify ZERO pollution: pre-existing data is preserved exactly, import data rolled back completely
      final accounts = await db.query(TablesSchema.accounts);
      expect(accounts, hasLength(1));
      expect(accounts.single['id'], 'acc_existing');
      expect(accounts.single['name'], 'حساب قديم محفوظ');

      final categories = await db.query(TablesSchema.categories);
      expect(categories, hasLength(1));
      expect(categories.single['id'], 'cat_existing');

      final transactions = await db.query(TablesSchema.transactions);
      expect(transactions, hasLength(1));
      expect(transactions.single['id'], 'tx_existing');
      expect(transactions.single['description'], 'قيد سابق');
    } finally {
      await db.close();
    }
  });
}
