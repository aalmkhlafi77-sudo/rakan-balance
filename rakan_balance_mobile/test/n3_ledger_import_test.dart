import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/importing/ledger_import_service.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
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

  test('preview blocks unknown account, missing direction and invalid amount', () {
    final preview = LedgerImportService.previewFromRows(
      sourceName: 'bad.csv',
      accountRows: const [],
      transactionRows: [
        {
          'accountref': 'missing',
          'entrytype': '',
          'amount': '-10',
          'date': '2026-11-07',
          'description': 'غير صالح',
        },
      ],
      existingAccounts: const [],
      existingTransactions: const [],
    );

    expect(preview.canCommit, false);
    expect(preview.blockingIssues, isNotEmpty);
    expect(
      preview.blockingIssues.any(
        (issue) => issue.message.contains('مرجع الحساب غير موجود'),
      ),
      true,
    );
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

  test('late SQL failure rolls back the whole import batch', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      final preview = LedgerImportService.previewFromRows(
        sourceName: 'rollback.csv',
        accountRows: [
          {
            'externalref': 'A-1',
            'name': 'لن يبقى',
            'category': 'اختبار',
            'openingbalance': '5.00',
          },
        ],
        transactionRows: [
          {
            'accountref': 'A-1',
            'entrytype': 'لك',
            'amount': '1.00',
            'date': '2026-11-07',
            'description': 'FAIL',
          },
        ],
        existingAccounts: const [],
        existingTransactions: const [],
      );
      expect(preview.canCommit, true);

      await db.execute('''
        CREATE TRIGGER block_import_transaction
        BEFORE INSERT ON transactions
        WHEN NEW.description = 'FAIL'
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

      expect(await db.query(TablesSchema.accounts), isEmpty);
      expect(await db.query(TablesSchema.categories), isEmpty);
      expect(await db.query(TablesSchema.transactions), isEmpty);
    } finally {
      await db.close();
    }
  });
}
