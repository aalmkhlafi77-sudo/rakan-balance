import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'package:rakan_balance_mobile/data/sqlite/database_helper.dart';
import 'package:rakan_balance_mobile/data/sqlite/mobile_backup_service.dart';
import 'package:rakan_balance_mobile/data/sqlite/sqlite_storage_adapter.dart';
import 'package:rakan_balance_mobile/data/sqlite/tables_schema.dart';
import 'package:rakan_balance_mobile/domain/validators/backup_validator.dart';
import 'package:rakan_balance_mobile/domain/financial/inter_account_transfer_engine.dart';
import 'package:rakan_balance_mobile/domain/models/transaction_model.dart';

Map<String, dynamic> _webBackup() {
  final data = <String, dynamic>{
    'accounts': [
      {
        'id': 'acc-1', 'name': 'عميل', 'parentId': null,
        'categoryId': 'cat-1', 'openingBalanceMinor': 10000,
        'status': 'active', 'phone': '0500000000',
        'notes': 'خاص لا يظهر في التقرير',
        'createdAt': '2026-11-01T00:00:00Z',
        'updatedAt': '2026-11-01T00:00:00Z',
      },
    ],
    'categories': [
      {'id': 'cat-1', 'name': 'عملاء', 'sortOrder': 0},
    ],
    'transactions': [
      {
        'id': 'tx-source', 'accountId': 'acc-1',
        'entryType': 'owedByAccount', 'amountMinor': 5000,
        'date': '2026-11-02', 'description': 'فاتورة',
        'notes': 'ملاحظات الحركة',
        'attachmentIds': ['att-1'],
        'createdAt': '2026-11-02T00:00:00Z',
        'updatedAt': '2026-11-02T00:00:00Z',
      },
      {
        'id': 'tx-payment', 'accountId': 'acc-1',
        'entryType': 'owedToAccount', 'amountMinor': 2000,
        'date': '2026-11-03', 'description': 'دفعة',
        'attachmentIds': <String>[],
        'createdAt': '2026-11-03T00:00:00Z',
        'updatedAt': '2026-11-03T00:00:00Z',
      },
    ],
    'attachments': [
      {
        'id': 'att-1', 'transactionId': 'tx-source',
        'originalName': 'document.pdf', 'mimeType': 'application/pdf',
        'size': 4, 'dataUrl': 'data:application/pdf;base64,AAAA',
        'createdAt': '2026-11-02T00:00:00Z',
      },
    ],
    'notes': [
      {
        'id': 'note-1', 'title': 'ملاحظة عامة',
        'content': 'النص العام', 'color': 'blue', 'archived': true,
        'createdAt': '2026-11-01T00:00:00Z',
        'updatedAt': '2026-11-01T00:00:00Z',
      },
    ],
    'dues': [
      {
        'id': 'due-1', 'accountId': 'acc-1',
        'sourceTransactionId': 'tx-source', 'entryType': 'owedByAccount',
        'dueDate': '2026-11-30', 'originalAmountMinor': 5000,
        'settledAmountMinor': 2000, 'status': 'partially_settled',
        'createdAt': '2026-11-02T00:00:00Z',
        'updatedAt': '2026-11-03T00:00:00Z',
      },
    ],
    'allocations': [
      {
        'id': 'alloc-1', 'dueItemId': 'due-1',
        'paymentTransactionId': 'tx-payment', 'amountMinor': 2000,
      },
    ],
    'reminders': [
      {
        'id': 'rem-1', 'dueItemId': 'due-1',
        'remindAt': '2026-11-29', 'templateText': 'متابعة',
        'isCompleted': false, 'channel': 'manual',
      },
    ],
    'settings': {
      'ownerName': 'المالك', 'theme': 'light',
      'sidebarCollapsed': false, 'currencyCode': 'SAR',
      'currencySymbol': 'ر.س', 'currencyDecimals': 2,
    },
  };
  return {
    'manifest': {
      'formatName': 'RAKAN_BALANCE_BACKUP',
      'backupFormatVersion': 2,
      'schemaVersion': 2,
      'checksum': sha256.convert(utf8.encode(jsonEncode(data))).toString(),
      'recordCounts': {
        for (final key in [
          'accounts', 'categories', 'transactions', 'attachments', 'notes',
          'dues', 'allocations', 'reminders',
        ]) key: (data[key] as List).length,
      },
    },
    'data': data,
  };
}


Map<String, dynamic> _transferBackup() {
  final data = <String, dynamic>{
    'accounts': [
      {
        'id': 'src', 'name': 'المصدر', 'parentId': null,
        'categoryId': 'cat', 'openingBalanceMinor': 10000,
        'status': 'active', 'createdAt': '2026-11-01T00:00:00Z',
        'updatedAt': '2026-11-01T00:00:00Z',
      },
      {
        'id': 'dst', 'name': 'الوجهة', 'parentId': null,
        'categoryId': 'cat', 'openingBalanceMinor': 0,
        'status': 'active', 'createdAt': '2026-11-01T00:00:00Z',
        'updatedAt': '2026-11-01T00:00:00Z',
      },
    ],
    'categories': [
      {'id': 'cat', 'name': 'عام', 'sortOrder': 0},
    ],
    'transactions': [
      {
        'id': 'tx-src', 'accountId': 'src',
        'entryType': 'owedToAccount', 'amountMinor': 4000,
        'date': '2026-11-02', 'description': 'نقل مديونية',
        'attachmentIds': <String>[], 'transferId': 'tr-1',
        'transferRole': 'source', 'counterpartyAccountId': 'dst',
        'createdAt': '2026-11-02T00:00:00Z',
        'updatedAt': '2026-11-02T00:00:00Z',
      },
      {
        'id': 'tx-dst', 'accountId': 'dst',
        'entryType': 'owedByAccount', 'amountMinor': 4000,
        'date': '2026-11-02', 'description': 'نقل مديونية',
        'attachmentIds': <String>[], 'transferId': 'tr-1',
        'transferRole': 'destination', 'counterpartyAccountId': 'src',
        'createdAt': '2026-11-02T00:00:00Z',
        'updatedAt': '2026-11-02T00:00:00Z',
      },
    ],
    'attachments': <dynamic>[],
    'notes': <dynamic>[],
    'dues': <dynamic>[],
    'allocations': <dynamic>[],
    'reminders': <dynamic>[],
    'settings': {
      'ownerName': 'مالك', 'theme': 'light',
      'sidebarCollapsed': false, 'currencyCode': 'SAR',
      'currencySymbol': 'ر.س', 'currencyDecimals': 2,
    },
  };
  return {
    'manifest': {
      'formatName': 'RAKAN_BALANCE_BACKUP',
      'backupFormatVersion': 2,
      'schemaVersion': 2,
      'checksum': sha256.convert(utf8.encode(jsonEncode(data))).toString(),
      'recordCounts': {
        'accounts': 2, 'categories': 1, 'transactions': 2,
        'attachments': 0, 'notes': 0, 'dues': 0,
        'allocations': 0, 'reminders': 0,
      },
    },
    'data': data,
  };
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('N2 web JSON imports into SQLite and exports without losing metadata', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      final bundle = _webBackup();
      final json = jsonEncode(bundle);
      expect(BackupValidator.validateBackupJson(json).isValid, true);
      await SqliteStorageAdapter(db).atomicRestoreBackup(
        Map<String, dynamic>.from(bundle['data'] as Map));

      final accounts = await db.query(TablesSchema.accounts);
      expect(accounts.length, 1);
      expect(accounts.single['phone'], '0500000000');
      expect(accounts.single['notes'], 'خاص لا يظهر في التقرير');

      final movements = await db.query(TablesSchema.transactions);
      expect(movements.length, 2);
      expect(movements.firstWhere((m) => m['id'] == 'tx-source')['notes'],
        'ملاحظات الحركة');

      final attachments = await db.query(TablesSchema.attachments);
      expect(attachments.single['transactionId'], 'tx-source');
      expect(attachments.single['originalName'], 'document.pdf');
      expect(attachments.single['dataUrl'], 'data:application/pdf;base64,AAAA');

      final notes = await db.query(TablesSchema.notes);
      expect(notes.single['title'], 'ملاحظة عامة');
      expect(notes.single['archived'], 1);

      final dues = await db.query(TablesSchema.dues);
      expect(dues.single['sourceTransactionId'], 'tx-source');

      final reminders = await db.query(TablesSchema.reminders);
      expect(reminders.single['isCompleted'], 0);

      final exported = await MobileBackupService.exportJson(db);
      final parsed = BackupValidator.validateBackupJson(exported);
      expect(parsed.isValid, true, reason: parsed.error);
      final data = parsed.parsedBundle!['data'] as Map<String, dynamic>;
      final tx = (data['transactions'] as List)
          .cast<Map<String, dynamic>>()
          .firstWhere((t) => t['id'] == 'tx-source');
      expect(tx['attachmentIds'], ['att-1']);
      expect((data['notes'] as List).single['archived'], true);
      expect((data['dues'] as List).single['sourceTransactionId'], 'tx-source');
      expect((data['reminders'] as List).single['isCompleted'], false);
    } finally {
      await db.close();
    }
  });

  test('failed restore rolls back deletion of previously saved ledger', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      await db.insert(TablesSchema.categories,
        {'id': 'old-cat', 'name': 'قديم', 'sortOrder': 0});
      await db.insert(TablesSchema.accounts, {
        'id': 'old', 'name': 'موجود', 'categoryId': 'old-cat',
        'openingBalanceMinor': 1234, 'status': 'active',
        'createdAt': '', 'updatedAt': '',
      });
      await db.execute('''
        CREATE TRIGGER block_restoration
        BEFORE INSERT ON transactions
        BEGIN
          SELECT RAISE(ABORT, 'simulated restore failure');
        END
      ''');
      final backup = _webBackup();
      await expectLater(
        SqliteStorageAdapter(db).atomicRestoreBackup(
          Map<String, dynamic>.from(backup['data'] as Map)),
        throwsException,
      );
      final existing = await db.query(TablesSchema.accounts);
      expect(existing.length, 1);
      expect(existing.single['id'], 'old');
      expect((await db.query(TablesSchema.categories)).single['id'], 'old-cat');
      expect(await db.query(TablesSchema.transactions), isEmpty);
    } finally {
      await db.close();
    }
  });

  test('tampered backup is rejected before SQL can run', () {
    final bundle = _webBackup();
    final valid = jsonEncode(bundle);
    expect(BackupValidator.validateBackupJson(valid).isValid, true);
    (bundle['data'] as Map<String, dynamic>)['accounts'][0]['openingBalanceMinor'] = 99999;
    expect(BackupValidator.validateBackupJson(jsonEncode(bundle)).isValid, false);
  });

  test('valid reciprocal transfer survives restore and re-export intact', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      final bundle = _transferBackup();
      final input = jsonEncode(bundle);
      final validated = BackupValidator.validateBackupJson(input);
      expect(validated.isValid, true, reason: validated.error);

      await SqliteStorageAdapter(db).atomicRestoreBackup(
        Map<String, dynamic>.from(bundle['data'] as Map));
      final stored = (await db.query(TablesSchema.transactions))
          .map((row) => TransactionModel.fromMap(row)).toList();
      expect(stored.length, 2);
      expect(InterAccountTransferEngine.validateTransferPair(stored).isValid, true);
      expect(stored.map((tx) => tx.transferRole).toSet(),
        {TransferRole.source, TransferRole.destination});

      final exported = await MobileBackupService.exportJson(db);
      final reparsed = BackupValidator.validateBackupJson(exported);
      expect(reparsed.isValid, true, reason: reparsed.error);
      final txs = (reparsed.parsedBundle!['data']['transactions'] as List)
          .cast<Map<String, dynamic>>();
      expect(txs.length, 2);
      expect(txs.every((tx) => tx['transferId'] == 'tr-1'), true);
    } finally {
      await db.close();
    }
  });

  test('late settings failure rolls back accounts, ledger and prior settings', () async {
    final db = await DatabaseHelper.initInMemoryDatabase();
    try {
      await db.insert(TablesSchema.categories,
        {'id': 'old-cat', 'name': 'قديم', 'sortOrder': 0});
      await db.insert(TablesSchema.accounts, {
        'id': 'old', 'name': 'حساب قديم', 'categoryId': 'old-cat',
        'openingBalanceMinor': 4321, 'status': 'active',
        'createdAt': '', 'updatedAt': '',
      });
      await db.insert(TablesSchema.settings, {
        'key': 'ownerName', 'value': jsonEncode('المالك القديم'),
      });
      await db.execute('''
        CREATE TRIGGER block_settings_restore
        BEFORE INSERT ON settings
        WHEN NEW.key = 'currencyDecimals'
        BEGIN
          SELECT RAISE(ABORT, 'simulated late settings failure');
        END
      ''');

      final bundle = _transferBackup();
      await expectLater(
        SqliteStorageAdapter(db).atomicRestoreBackup(
          Map<String, dynamic>.from(bundle['data'] as Map)),
        throwsException,
      );

      expect((await db.query(TablesSchema.accounts)).single['id'], 'old');
      expect((await db.query(TablesSchema.categories)).single['id'], 'old-cat');
      expect(await db.query(TablesSchema.transactions), isEmpty);
      final owner = (await db.query(TablesSchema.settings,
        where: 'key = ?', whereArgs: ['ownerName'])).single;
      expect(jsonDecode(owner['value'] as String), 'المالك القديم');
    } finally {
      await db.close();
    }
  });

}
