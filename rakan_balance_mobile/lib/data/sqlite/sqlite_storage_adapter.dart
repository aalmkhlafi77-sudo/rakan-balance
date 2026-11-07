import 'dart:convert';
import 'dart:math';
import '../../domain/models/account_model.dart';
import '../../domain/financial/money_utils.dart';
import 'package:sqflite/sqflite.dart';
import '../../domain/financial/inter_account_transfer_engine.dart';
import '../../domain/models/due_item_model.dart';
import '../../domain/models/transaction_model.dart';
import '../../domain/models/transfer_model.dart';
import 'tables_schema.dart';

class SqliteStorageAdapter {
  final Database _db;

  SqliteStorageAdapter(this._db);

  /// Validate ledger rules inside the SAME SQLite transaction that writes the pair.
  Future<void> _validateTransferInTxn(
    Transaction txn,
    InterAccountTransferInput input,
    bool isDemo, {
    String? editingTransferId,
  }) async {
    final accountsTable = isDemo ? TablesSchema.demoAccounts : TablesSchema.accounts;
    final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
    final accounts = (await txn.query(accountsTable))
        .map((row) => AccountModel.fromMap(row)).toList();
    final transactions = (await txn.query(txTable))
        .map((row) => TransactionModel.fromMap(row)).toList();
    final validation = InterAccountTransferEngine.validateTransfer(
      input: input,
      accounts: accounts,
      currentTransactions: transactions,
      editingTransferId: editingTransferId,
    );
    if (!validation.isValid) throw StateError(validation.error ?? 'تحويل مالي غير صالح.');
  }

  void _requireValidPair(List<Map<String, Object?>> rows) {
    final validation = InterAccountTransferEngine.validateTransferPair(
      rows.map((row) => TransactionModel.fromMap(row)).toList(),
    );
    if (!validation.isValid) throw StateError(validation.error ?? 'زوج الحركة البينية غير سليم.');
  }

  // =========================================================================
  // N1: Inter-Account Transfer Atomic SQLite Operations
  // =========================================================================

  Future<void> saveTransferAtomic({
    required InterAccountTransferInput input,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      await _validateTransferInTxn(txn, input, isDemo);
      final transferId = 'trsf_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(1 << 32)}';

      final accountsTable = isDemo ? TablesSchema.demoAccounts : TablesSchema.accounts;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;

      // Fetch account names inside transaction
      final srcMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.sourceAccountId]);
      final dstMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.destinationAccountId]);

      if (srcMaps.isEmpty || dstMaps.isEmpty) {
        throw Exception('الحساب المصدر أو الوجهة غير موجود.');
      }

      final srcName = srcMaps.first['name'] as String;
      final dstName = dstMaps.first['name'] as String;

      final entries = InterAccountTransferEngine.buildTransferEntries(
        input: input,
        transferId: transferId,
        sourceAccountName: srcName,
        destinationAccountName: dstName,
      );

      final pairValidation = InterAccountTransferEngine.validateTransferPair(entries);
      if (!pairValidation.isValid) {
        throw Exception(pairValidation.error ?? 'فشل إنشاء طرفي الحركة البينية.');
      }

      for (final entry in entries) {
        await txn.insert(txTable, entry.toMap(), conflictAlgorithm: ConflictAlgorithm.abort);
      }
    });
  }

  Future<void> updateTransferAtomic({
    required String transferId,
    required InterAccountTransferInput input,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final accountsTable = isDemo ? TablesSchema.demoAccounts : TablesSchema.accounts;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;

      final existingMaps = await txn.query(txTable, where: 'transferId = ?', whereArgs: [transferId]);
      if (existingMaps.length != 2) {
        throw Exception('الحركة البينية غير موجودة أو تالفة.');
      }
      _requireValidPair(existingMaps);
      await _validateTransferInTxn(txn, input, isDemo, editingTransferId: transferId);

      // Delete old pair
      await txn.delete(txTable, where: 'transferId = ?', whereArgs: [transferId]);

      final srcMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.sourceAccountId]);
      final dstMaps = await txn.query(accountsTable, where: 'id = ?', whereArgs: [input.destinationAccountId]);

      if (srcMaps.isEmpty || dstMaps.isEmpty) {
        throw Exception('الحساب المصدر أو الوجهة غير موجود.');
      }

      final entries = InterAccountTransferEngine.buildTransferEntries(
        input: input,
        transferId: transferId,
        sourceAccountName: srcMaps.first['name'] as String,
        destinationAccountName: dstMaps.first['name'] as String,
      );

      final pairValidation = InterAccountTransferEngine.validateTransferPair(entries);
      if (!pairValidation.isValid) throw StateError(pairValidation.error ?? 'زوج الحركة البينية غير سليم.');
      for (final entry in entries) {
        await txn.insert(txTable, entry.toMap(), conflictAlgorithm: ConflictAlgorithm.abort);
      }
    });
  }

  Future<void> deleteTransferAtomic({
    required String transferId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final existingMaps = await txn.query(txTable, where: 'transferId = ?', whereArgs: [transferId]);
      if (existingMaps.length != 2) {
        throw Exception('الحركة البينية التالفة لا يمكن حذفها إفرادياً.');
      }
      _requireValidPair(existingMaps);
      await txn.delete(txTable, where: 'transferId = ?', whereArgs: [transferId]);
    });
  }

  // Single transaction edit/delete guards
  Future<void> updateTransactionGuarded({
    required TransactionModel updatedTx,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final existingMaps = await txn.query(txTable, where: 'id = ?', whereArgs: [updatedTx.id]);
      if (existingMaps.isNotEmpty && existingMaps.first['transferId'] != null) {
        throw Exception('لا يمكن تعديل قيد بيني منفردًا؛ استخدم تعديل الحركة البينية.');
      }

      final allocMaps = await txn.query(allocTable, where: 'paymentTransactionId = ?', whereArgs: [updatedTx.id]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الحركة مرتبطة بسداد استحقاق ولا يمكن تعديلها منفردة.');
      }

      await txn.update(txTable, updatedTx.toMap(), where: 'id = ?', whereArgs: [updatedTx.id]);
    });
  }

  Future<void> deleteTransactionGuarded({
    required String txId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final existingMaps = await txn.query(txTable, where: 'id = ?', whereArgs: [txId]);
      if (existingMaps.isNotEmpty && existingMaps.first['transferId'] != null) {
        throw Exception('لا يمكن حذف قيد بيني منفردًا؛ استخدم حذف الحركة البينية.');
      }

      final allocMaps = await txn.query(allocTable, where: 'paymentTransactionId = ?', whereArgs: [txId]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الحركة مرتبطة بسداد استحقاق ولا يمكن حذفها منفردة.');
      }

      await txn.delete(txTable, where: 'id = ?', whereArgs: [txId]);
    });
  }

  // =========================================================================
  // N2: Due Follow-Up & Atomic Partial Settlements
  // =========================================================================

  Future<void> recordDuePaymentAtomic({
    required String dueId,
    required TransactionModel payment,
    required PaymentAllocationModel allocation,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final dueTable = isDemo ? TablesSchema.demoDues : TablesSchema.dues;
      final txTable = isDemo ? TablesSchema.demoTransactions : TablesSchema.transactions;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final dueMaps = await txn.query(dueTable, where: 'id = ?', whereArgs: [dueId]);
      if (dueMaps.isEmpty) throw Exception('الاستحقاق غير موجود.');

      final due = DueItemModel.fromMap(dueMaps.first);
      if (payment.amountMinor <= 0 || payment.amountMinor > MoneyUtils.maxSafeHalalas ||
          payment.amountMinor > due.remainingAmountMinor ||
          payment.accountId != due.accountId ||
          payment.entryType == due.entryType ||
          payment.transferId != null ||
          allocation.dueItemId != dueId ||
          allocation.paymentTransactionId != payment.id ||
          allocation.amountMinor != payment.amountMinor) {
        throw StateError('سداد الاستحقاق غير صالح أو لا يطابق تخصيص الحركة المالية.');
      }

      final updatedSettled = due.settledAmountMinor + payment.amountMinor;
      final newStatus = updatedSettled == due.originalAmountMinor ? 'settled' : 'partially_settled';

      await txn.update(
        dueTable,
        {
          'settledAmountMinor': updatedSettled,
          'status': newStatus,
          'updatedAt': DateTime.now().toIso8601String(),
        },
        where: 'id = ?',
        whereArgs: [dueId],
      );

      await txn.insert(txTable, payment.toMap());
      await txn.insert(allocTable, allocation.toMap());
    });
  }

  Future<void> deleteUnpaidDueAtomic({
    required String dueId,
    required bool isDemo,
  }) async {
    await _db.transaction((txn) async {
      final dueTable = isDemo ? TablesSchema.demoDues : TablesSchema.dues;
      final reminderTable = isDemo ? TablesSchema.demoReminders : TablesSchema.reminders;
      final allocTable = isDemo ? TablesSchema.demoPaymentAllocations : TablesSchema.paymentAllocations;

      final allocMaps = await txn.query(allocTable, where: 'dueItemId = ?', whereArgs: [dueId]);
      if (allocMaps.isNotEmpty) {
        throw Exception('الاستحقاق يحتوي على دفعات مخصصة ولا يمكن حذفه.');
      }

      await txn.delete(reminderTable, where: 'dueItemId = ?', whereArgs: [dueId]);
      await txn.delete(dueTable, where: 'id = ?', whereArgs: [dueId]);
    });
  }

  // =========================================================================
  // Atomic Backup Import & Restore
  // =========================================================================

  /// Replace real data atomically after BackupValidator has accepted the bundle.
  /// Convert JSON arrays and booleans to SQLite storage values. Never erase demo data.
  Future<void> atomicRestoreBackup(Map<String, dynamic> bundleData) async {
    List<Map<String, dynamic>> rows(String field, {bool optional = false}) {
      final value = bundleData[field];
      if (optional && value == null) return [];
      if (value is! List) throw FormatException('بيانات $field ناقصة أو غير صالحة.');
      return value.map((row) => Map<String, dynamic>.from(row as Map)).toList();
    }

    final categories = rows('categories');
    final accounts = rows('accounts');
    final movements = rows('transactions');
    final attachments = rows('attachments');
    final notes = rows('notes');
    final dues = rows('dues', optional: true);
    final allocations = rows('allocations', optional: true);
    final reminders = rows('reminders', optional: true);

    await _db.transaction((txn) async {
      // Foreign-key children first, parents last. A failure rolls back all deletes.
      for (final table in [
        TablesSchema.reminders,
        TablesSchema.paymentAllocations,
        TablesSchema.dues,
        TablesSchema.attachments,
        TablesSchema.transactions,
        TablesSchema.notes,
        TablesSchema.accounts,
        TablesSchema.categories,
      ]) {
        await txn.delete(table);
      }

      for (final row in categories) {
        await txn.insert(TablesSchema.categories, {
          'id': row['id'], 'name': row['name'], 'sortOrder': row['sortOrder'] ?? 0,
        });
      }
      for (final row in accounts) {
        await txn.insert(TablesSchema.accounts,
            AccountModel.fromMap(row).toMap());
      }
      for (final row in movements) {
        await txn.insert(TablesSchema.transactions,
            TransactionModel.fromMap(row).toMap());
      }
      for (final row in attachments) {
        // v3 required legacy columns remain populated for additive migration.
        // New v4 columns retain the original web attachment representation.
        final name = (row['originalName'] ?? row['filename']) as String?;
        final size = (row['size'] ?? row['sizeBytes']) as int?;
        final bytes = (row['dataUrl'] ?? row['base64Data']) as String?;
        await txn.insert(TablesSchema.attachments, {
          'id': row['id'],
          'filename': name ?? '',
          'mimeType': row['mimeType'],
          'sizeBytes': size ?? 0,
          'base64Data': bytes ?? '',
          'transactionId': row['transactionId'],
          'originalName': name,
          'size': size,
          'dataUrl': bytes,
          'createdAt': row['createdAt'],
        });
      }
      for (final row in notes) {
        final archived = row['archived'];
        await txn.insert(TablesSchema.notes, {
          'id': row['id'], 'title': row['title'] ?? '',
          'content': row['content'],
          'color': row['color'] ?? 'slate',
          'archived': archived == true || archived == 1 ? 1 : 0,
          'createdAt': row['createdAt'], 'updatedAt': row['updatedAt'],
        });
      }
      for (final row in dues) {
        await txn.insert(TablesSchema.dues, DueItemModel.fromMap(row).toMap());
      }
      for (final row in allocations) {
        await txn.insert(TablesSchema.paymentAllocations,
            PaymentAllocationModel.fromMap(row).toMap());
      }
      for (final row in reminders) {
        await txn.insert(TablesSchema.reminders,
            ReminderModel.fromMap(row).toMap());
      }
      final sourceSettings = bundleData['settings'];
      if (sourceSettings is Map) {
        const allowed = [
          'ownerName', 'theme', 'sidebarCollapsed', 'currencyCode',
          'currencySymbol', 'currencyDecimals',
        ];
        for (final key in allowed) {
          if (sourceSettings.containsKey(key)) {
            await txn.insert(TablesSchema.settings, {
              'key': key, 'value': jsonEncode(sourceSettings[key]),
            }, conflictAlgorithm: ConflictAlgorithm.replace);
          }
        }
      }
    });
  }
}
