import 'package:flutter_test/flutter_test.dart';
import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/models/account_model.dart';
import 'package:rakan_balance_mobile/domain/models/transfer_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('SQLite Atomic Transactions & Storage Adapter Suite', () {
    test('saveTransferAtomic saves source and destination entries atomically in SQLite', () async {
      final db = await DatabaseHelper.initInMemoryDatabase();
      final adapter = SqliteStorageAdapter(db);

      // Insert 2 test accounts
      await db.insert(TablesSchema.accounts, AccountModel(id: 'src', name: 'المصدر', categoryId: 'c1', openingBalanceMinor: 50000, createdAt: '', updatedAt: '').toMap());
      await db.insert(TablesSchema.accounts, AccountModel(id: 'dst', name: 'الوجهة', categoryId: 'c1', openingBalanceMinor: 10000, createdAt: '', updatedAt: '').toMap());

      final input = InterAccountTransferInput(
        sourceAccountId: 'src',
        destinationAccountId: 'dst',
        amountMinor: 15000,
        date: '2026-02-01',
        description: 'تحويل اختبار',
      );

      await adapter.saveTransferAtomic(input: input, isDemo: false);

      final txs = await db.query(TablesSchema.transactions);
      expect(txs.length, 2);
      expect(txs[0]['transferId'], txs[1]['transferId']);
      expect(txs[0]['transferId'], isNotNull);

      await db.close();
    });

    test('Guarded single-entry mutation throws exception when attempting to edit or delete transfer entry individually', () async {
      final db = await DatabaseHelper.initInMemoryDatabase();
      final adapter = SqliteStorageAdapter(db);

      await db.insert(TablesSchema.accounts, AccountModel(id: 'src', name: 'المصدر', categoryId: 'c1', openingBalanceMinor: 50000, createdAt: '', updatedAt: '').toMap());
      await db.insert(TablesSchema.accounts, AccountModel(id: 'dst', name: 'الوجهة', categoryId: 'c1', openingBalanceMinor: 10000, createdAt: '', updatedAt: '').toMap());

      await adapter.saveTransferAtomic(
        input: InterAccountTransferInput(sourceAccountId: 'src', destinationAccountId: 'dst', amountMinor: 10000, date: '2026-02-01', description: 'تحويل اختبار'),
        isDemo: false,
      );

      final txs = await db.query(TablesSchema.transactions);
      final txId = txs.first['id'] as String;

      expect(
        () => adapter.deleteTransactionGuarded(txId: txId, isDemo: false),
        throwsA(isA<Exception>()),
      );

      await db.close();
    });
  });
}
