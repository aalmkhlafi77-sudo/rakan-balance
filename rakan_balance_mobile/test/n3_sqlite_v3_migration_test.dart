import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'fixtures/legacy_v3_schema.dart';

const _legacyCreate = <String>[
  LegacyV3Schema.createAccounts,
  LegacyV3Schema.createDemoAccounts,
  LegacyV3Schema.createCategories,
  LegacyV3Schema.createDemoCategories,
  LegacyV3Schema.createTransactions,
  LegacyV3Schema.createDemoTransactions,
  LegacyV3Schema.createAttachments,
  LegacyV3Schema.createNotes,
  LegacyV3Schema.createDemoNotes,
  LegacyV3Schema.createDues,
  LegacyV3Schema.createDemoDues,
  LegacyV3Schema.createPaymentAllocations,
  LegacyV3Schema.createDemoPaymentAllocations,
  LegacyV3Schema.createReminders,
  LegacyV3Schema.createDemoReminders,
  LegacyV3Schema.createSettings,
];

Future<void> _seedLegacy(Database db) async {
  const ts = '2026-10-01T00:00:00Z';
  for (final table in ['categories', 'demo_categories']) {
    await db.insert(table, {'id': 'cat', 'name': 'عميل', 'sortOrder': 0});
  }
  for (final table in ['accounts', 'demo_accounts']) {
    await db.insert(table, {
      'id': 'acc', 'name': 'حساب قديم', 'categoryId': 'cat',
      'openingBalanceMinor': 12345, 'status': 'active',
      'notes': 'ملاحظة خاصة', 'createdAt': ts, 'updatedAt': ts,
    });
  }
  for (final table in ['transactions', 'demo_transactions']) {
    await db.insert(table, {
      'id': 'tx', 'accountId': 'acc', 'entryType': 'owedByAccount',
      'amountMinor': 5001, 'date': '2026-10-02',
      'description': 'حركة قديمة', 'attachmentIds': '["att"]',
      'createdAt': ts, 'updatedAt': ts,
    });
  }
  for (final table in ['dues', 'demo_dues']) {
    await db.insert(table, {
      'id': 'due', 'accountId': 'acc', 'entryType': 'owedByAccount',
      'dueDate': '2026-12-01', 'originalAmountMinor': 5001,
      'settledAmountMinor': 1001, 'status': 'partially_settled',
      'createdAt': ts, 'updatedAt': ts,
    });
  }
  for (final table in ['payment_allocations', 'demo_payment_allocations']) {
    await db.insert(table, {
      'id': 'alloc', 'dueItemId': 'due', 'paymentTransactionId': 'tx',
      'amountMinor': 1001,
    });
  }
  for (final table in ['reminders', 'demo_reminders']) {
    await db.insert(table, {
      'id': 'rem', 'dueItemId': 'due', 'remindAt': '2026-11-30',
      'templateText': 'متابعة', 'isCompleted': 0, 'channel': 'manual',
    });
  }
  for (final table in ['notes', 'demo_notes']) {
    await db.insert(table, {
      'id': 'note', 'content': 'ملاحظة قديمة',
      'createdAt': ts, 'updatedAt': ts,
    });
  }
  await db.insert('attachments', {
    'id': 'att', 'filename': 'legacy.pdf',
    'mimeType': 'application/pdf', 'sizeBytes': 4,
    'base64Data': 'AAAA', 'createdAt': ts,
  });
  await db.insert('settings', {'key': 'ownerName', 'value': 'مالك قديم'});
}

Future<Set<String>> _columns(Database db, String table) async {
  final info = await db.rawQuery('PRAGMA table_info($table)');
  return info.map((row) => row['name'] as String).toSet();
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('real v3 database upgrades to v4 without losing financial rows, demo rows or attachments', () async {
    final dir = await Directory.systemTemp.createTemp('rakan_v3_upgrade_');
    final path = p.join(dir.path, 'rakan_balance_v3.db');
    Database? db;
    try {
      db = await openDatabase(path, version: 3,
        onConfigure: (database) async => database.execute('PRAGMA foreign_keys = ON'),
        onCreate: (database, version) async {
          for (final statement in _legacyCreate) {
            await database.execute(statement);
          }
        });
      await _seedLegacy(db);
      expect(await db.getVersion(), 3);
      await db.close();
      db = null;

      db = await openDatabase(path, version: 4,
        onConfigure: (database) async => database.execute('PRAGMA foreign_keys = ON'),
        onUpgrade: DatabaseHelper.migrateSchema);
      expect(await db.getVersion(), 4);

      for (final table in [
        TablesSchema.accounts, TablesSchema.demoAccounts,
        TablesSchema.categories, TablesSchema.demoCategories,
        TablesSchema.transactions, TablesSchema.demoTransactions,
        TablesSchema.dues, TablesSchema.demoDues,
        TablesSchema.paymentAllocations, TablesSchema.demoPaymentAllocations,
        TablesSchema.reminders, TablesSchema.demoReminders,
        TablesSchema.notes, TablesSchema.demoNotes,
        TablesSchema.attachments, TablesSchema.settings,
      ]) {
        expect((await db.query(table)).length, 1, reason: table);
      }

      for (final table in ['accounts', 'demo_accounts']) {
        final row = (await db.query(table)).single;
        expect(row['openingBalanceMinor'], 12345);
        expect(row['notes'], 'ملاحظة خاصة');
        expect(row['phone'], isNull);
        expect(await _columns(db, table), contains('phone'));
      }
      for (final table in ['transactions', 'demo_transactions']) {
        final row = (await db.query(table)).single;
        expect(row['amountMinor'], 5001);
        expect(row['attachmentIds'], '["att"]');
        expect(row['notes'], isNull);
        expect(await _columns(db, table), contains('notes'));
      }
      for (final table in ['dues', 'demo_dues']) {
        final row = (await db.query(table)).single;
        expect(row['settledAmountMinor'], 1001);
        expect(row['sourceTransactionId'], isNull);
      }
      for (final table in ['payment_allocations', 'demo_payment_allocations']) {
        expect((await db.query(table)).single['amountMinor'], 1001);
      }
      for (final table in ['notes', 'demo_notes']) {
        final row = (await db.query(table)).single;
        expect(row['content'], 'ملاحظة قديمة');
        expect(row['title'], '');
        expect(row['color'], 'slate');
        expect(row['archived'], 0);
      }
      final attachment = (await db.query('attachments')).single;
      expect(attachment['filename'], 'legacy.pdf');
      expect(attachment['base64Data'], 'AAAA');
      expect(attachment['dataUrl'], isNull);
      expect(await _columns(db, 'attachments'), containsAll([
        'transactionId', 'originalName', 'size', 'dataUrl',
      ]));
      expect((await db.query('settings')).single['value'], 'مالك قديم');
      expect(await db.rawQuery('PRAGMA foreign_key_check'), isEmpty);
      expect((await db.rawQuery('PRAGMA integrity_check')).single.values.single, 'ok');

      await db.close();
      db = null;
      db = await openDatabase(path, version: 4);
      expect((await db.query('transactions')).single['amountMinor'], 5001);
      expect((await db.query('demo_transactions')).single['amountMinor'], 5001);
    } finally {
      await db?.close();
      await dir.delete(recursive: true);
    }
  });
}
